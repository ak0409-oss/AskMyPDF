"""
PDF RAG Backend - FastAPI
Chunks PDFs, stores embeddings in Qdrant, answers questions with Gemini.

Improvements over v1:
- Page numbers stored in chunk metadata and cited in answers
- Context formatted as [Page N]: text for grounded citations
- Keyword overlap re-ranking after dense retrieval
- Multi-query expansion for broader retrieval coverage
- Reciprocal Rank Fusion (RRF) to merge multi-query results
- Tightened system prompt: page citations + markdown formatting

Run:
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
"""

import os
import json
import tempfile
from typing import Optional

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

from openai import OpenAI
from langchain_community.document_loaders import PyPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from langchain_qdrant import QdrantVectorStore
from qdrant_client import QdrantClient
from qdrant_client.http.models import Distance, VectorParams

load_dotenv()

# ─── Config ────────────────────────────────────────────────────────────────────

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
QDRANT_URL = os.getenv("QDRANT_URL", "http://localhost:6333")
COLLECTION_NAME = os.getenv("COLLECTION_NAME", "pdf_rag_collection")
CHUNK_SIZE = int(os.getenv("CHUNK_SIZE", "1000"))
CHUNK_OVERLAP = int(os.getenv("CHUNK_OVERLAP", "100"))

if not GEMINI_API_KEY:
    raise RuntimeError("GEMINI_API_KEY is not set in .env")

# ─── Clients ───────────────────────────────────────────────────────────────────

gemini_client = OpenAI(
    api_key=GEMINI_API_KEY,
    base_url="https://generativelanguage.googleapis.com/v1beta/openai/"
)

embedder = GoogleGenerativeAIEmbeddings(
    google_api_key=GEMINI_API_KEY,
    model="models/text-embedding-004"
)

qdrant_client = QdrantClient(url=QDRANT_URL)

# ─── App ───────────────────────────────────────────────────────────────────────

app = FastAPI(title="PDF RAG API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Helpers ───────────────────────────────────────────────────────────────────

def ensure_collection():
    """Create Qdrant collection if it doesn't exist."""
    existing = [c.name for c in qdrant_client.get_collections().collections]
    if COLLECTION_NAME not in existing:
        qdrant_client.create_collection(
            collection_name=COLLECTION_NAME,
            vectors_config=VectorParams(size=768, distance=Distance.COSINE),
        )
        print(f"✅ Created collection: {COLLECTION_NAME}")
    else:
        print(f"📦 Using existing collection: {COLLECTION_NAME}")


def get_vector_store() -> QdrantVectorStore:
    ensure_collection()
    return QdrantVectorStore(
        client=qdrant_client,
        collection_name=COLLECTION_NAME,
        embedding=embedder,
    )


def keyword_rerank(query: str, docs: list, top_k: int = 5) -> list:
    """
    Re-rank docs by keyword overlap with the query.
    Inspired by AskMyPDF/services/geminiService.ts retrieveTopChunks().
    Used as a second-stage ranker on top of dense retrieval results.
    """
    q_words = set(query.lower().split())
    scored = []
    for doc in docs:
        d_words = set(doc.page_content.lower().split())
        overlap = len(q_words & d_words)
        scored.append((overlap, doc))
    scored.sort(key=lambda x: x[0], reverse=True)
    return [doc for _, doc in scored[:top_k]]


def generate_alternative_queries(question: str) -> list[str]:
    """
    Use Gemini to generate 3-4 alternative phrasings of the user question
    for broader retrieval coverage (multi-query expansion).
    Returns a list of prompt strings including the original question.
    """
    system_prompt = """You are a helpful assistant that generates alternative phrasings of a user question to improve document retrieval.

Generate exactly 3 alternative phrasings of the given question. Each should approach the same topic from a different angle — more specific, more general, or using different terminology.

Return output strictly as a JSON array:
[
  {"prompt": "string"},
  {"prompt": "string"},
  {"prompt": "string"}
]"""

    try:
        response = gemini_client.chat.completions.create(
            model="gemini-2.0-flash",
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": question},
            ],
        )
        raw = json.loads(response.choices[0].message.content)
        # Handle both {"prompts": [...]} and direct array wrapped in object
        if isinstance(raw, list):
            prompts = [item["prompt"] for item in raw if "prompt" in item]
        elif isinstance(raw, dict):
            # Try common wrapper keys
            for key in raw:
                val = raw[key]
                if isinstance(val, list):
                    prompts = [item["prompt"] for item in val if isinstance(item, dict) and "prompt" in item]
                    break
            else:
                prompts = []
        else:
            prompts = []
    except Exception:
        prompts = []

    return [question] + prompts[:3]


def reciprocal_rank_fusion(rankings: list[list], k: int = 60) -> list:
    """
    Fuse multiple ranked lists of docs using Reciprocal Rank Fusion.
    Returns a deduplicated list of docs sorted by fused score (highest first).
    k=60 is the standard smoothing constant.
    """
    doc_scores: dict[str, float] = {}
    doc_map: dict[str, object] = {}

    for ranking in rankings:
        for idx, doc in enumerate(ranking):
            doc_id = doc.metadata.get("_id") or doc.page_content[:100]
            rr = 1.0 / (idx + 1 + k)
            if doc_id in doc_scores:
                doc_scores[doc_id] += rr
            else:
                doc_scores[doc_id] = rr
                doc_map[doc_id] = doc

    sorted_ids = sorted(doc_scores, key=lambda x: doc_scores[x], reverse=True)
    return [doc_map[doc_id] for doc_id in sorted_ids]


# ─── Models ────────────────────────────────────────────────────────────────────

class AskRequest(BaseModel):
    question: str
    top_k: Optional[int] = 5


class AskResponse(BaseModel):
    answer: str
    sources: list[str]


class UploadResponse(BaseModel):
    message: str
    filename: str
    chunks_stored: int


class StatusResponse(BaseModel):
    status: str
    collection: str
    total_vectors: int
    qdrant_url: str


# ─── Routes ────────────────────────────────────────────────────────────────────

@app.get("/", tags=["Health"])
def root():
    return {"message": "PDF RAG API is running 🚀"}


@app.get("/status", response_model=StatusResponse, tags=["Health"])
def status():
    """Check Qdrant connection and collection stats."""
    try:
        ensure_collection()
        info = qdrant_client.get_collection(COLLECTION_NAME)
        return StatusResponse(
            status="ok",
            collection=COLLECTION_NAME,
            total_vectors=info.vectors_count or 0,
            qdrant_url=QDRANT_URL,
        )
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Qdrant unavailable: {str(e)}")


@app.post("/upload", response_model=UploadResponse, tags=["RAG"])
async def upload_pdf(file: UploadFile = File(...)):
    """
    Upload a PDF → chunk → embed → store in Qdrant.
    Each chunk is tagged with source_filename and page_number metadata.
    """
    if not file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")

    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
        contents = await file.read()
        tmp.write(contents)
        tmp_path = tmp.name

    try:
        loader = PyPDFLoader(file_path=tmp_path)
        docs = loader.load()

        splitter = RecursiveCharacterTextSplitter(
            chunk_size=CHUNK_SIZE,
            chunk_overlap=CHUNK_OVERLAP,
        )
        chunks = splitter.split_documents(docs)

        for chunk in chunks:
            chunk.metadata["source_filename"] = file.filename
            # PyPDFLoader stores page index (0-based) in metadata["page"]
            # Convert to 1-based page number for display
            raw_page = chunk.metadata.get("page")
            chunk.metadata["page_number"] = (raw_page + 1) if isinstance(raw_page, int) else "unknown"

        vs = get_vector_store()
        vs.add_documents(chunks)

        return UploadResponse(
            message="PDF processed and indexed successfully.",
            filename=file.filename,
            chunks_stored=len(chunks),
        )
    finally:
        os.unlink(tmp_path)


@app.post("/ask", response_model=AskResponse, tags=["RAG"])
def ask(body: AskRequest):
    """
    Ask a question → multi-query expansion → retrieve relevant chunks →
    RRF fusion → keyword re-rank → generate grounded answer with Gemini.
    Answers include page number citations.
    """
    if not body.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty.")

    vs = get_vector_store()

    # Step 1: Generate alternative queries for broader retrieval
    all_queries = generate_alternative_queries(body.question)

    # Step 2: Dense retrieval for each query (fetch more per query, fuse later)
    per_query_k = max(body.top_k * 2, 8)
    rankings = []
    for query in all_queries:
        results = vs.similarity_search(query, k=per_query_k)
        if results:
            rankings.append(results)

    if not rankings:
        return AskResponse(
            answer="I couldn't find any relevant information in the uploaded documents. Please upload a PDF first.",
            sources=[],
        )

    # Step 3: Reciprocal Rank Fusion across all query results
    fused_docs = reciprocal_rank_fusion(rankings)

    # Step 4: Keyword overlap re-rank on fused pool, keep top_k
    top_docs = keyword_rerank(body.question, fused_docs, top_k=body.top_k)

    # Step 5: Build context with page citations (inspired by AskMyPDF geminiService.ts)
    context_parts = []
    for doc in top_docs:
        page = doc.metadata.get("page_number", "?")
        context_parts.append(f"[Page {page}]: {doc.page_content}")
    context = "\n\n".join(context_parts)

    sources = list({
        doc.metadata.get("source_filename", "Unknown")
        for doc in top_docs
    })

    # Step 6: Generate answer strictly from retrieved context
    system_prompt = f"""You are an intelligent AI assistant that answers user queries strictly using the provided context from PDF documents.

Instructions:
- Answer ONLY based on the context below. Do not hallucinate or use outside knowledge.
- Always cite the page number (e.g., "According to Page 3...") when referencing information.
- Be clear, factual, and well-structured. Use markdown formatting with headings and bullet points where helpful.
- If the context does not contain enough information to answer, say so clearly and mention which aspect is missing.
- Do not wrap your answer in JSON.

Context from the document:
{context}
"""

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": body.question},
    ]

    response = gemini_client.chat.completions.create(
        model="gemini-2.0-flash",
        messages=messages,
    )

    answer = response.choices[0].message.content
    return AskResponse(answer=answer, sources=sources)


@app.delete("/collection", tags=["Admin"])
def clear_collection():
    """Delete and recreate the Qdrant collection (clears all documents)."""
    try:
        qdrant_client.delete_collection(COLLECTION_NAME)
        ensure_collection()
        return {"message": f"Collection '{COLLECTION_NAME}' cleared successfully."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
