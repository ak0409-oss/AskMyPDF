"""
PDF RAG Backend - FastAPI
Chunks PDFs, stores embeddings in Qdrant, answers questions with Gemini.
"""

import os
import json
import tempfile
from typing import Optional

from fastapi import FastAPI, UploadFile, File, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
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

GEMINI_API_KEY  = os.getenv("GEMINI_API_KEY")
QDRANT_URL      = os.getenv("QDRANT_URL", "http://localhost:6333")
QDRANT_API_KEY  = os.getenv("QDRANT_API_KEY")
COLLECTION_NAME = os.getenv("COLLECTION_NAME", "pdf_rag_collection")
CHUNK_SIZE      = int(os.getenv("CHUNK_SIZE", "1000"))
CHUNK_OVERLAP   = int(os.getenv("CHUNK_OVERLAP", "100"))

if not GEMINI_API_KEY:
    raise RuntimeError("GEMINI_API_KEY is not set in .env")

# ─── Clients ───────────────────────────────────────────────────────────────────

gemini_client = OpenAI(
    api_key=GEMINI_API_KEY,
    base_url="https://generativelanguage.googleapis.com/v1beta/openai/"
)

# Use models/embedding-001 — stable, supported embedding model via Google Generative AI
embedder = GoogleGenerativeAIEmbeddings(
    google_api_key=GEMINI_API_KEY,
    model="models/embedding-001"
)

qdrant_client = QdrantClient(
    url=QDRANT_URL,
    api_key=QDRANT_API_KEY,
)

# ─── App ───────────────────────────────────────────────────────────────────────

app = FastAPI(title="PDF RAG API", version="2.0.0")


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Ensure CORS headers are present even on unhandled 500 errors."""
    return JSONResponse(
        status_code=500,
        content={"detail": str(exc)},
        headers={"Access-Control-Allow-Origin": "*"},
    )


# IMPORTANT: do NOT mix allow_origins=["*"] with allow_origin_regex —
# they conflict in Starlette's CORSMiddleware. Use regex only.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:3000",
        "https://askmypdf-m7ut.onrender.com",
    ],
    allow_origin_regex=r"https://.*\.vercel\.app",  # covers all preview + prod Vercel URLs
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Helpers ───────────────────────────────────────────────────────────────────

def ensure_collection():
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
    q_words = set(query.lower().split())
    scored = []
    for doc in docs:
        d_words = set(doc.page_content.lower().split())
        overlap = len(q_words & d_words)
        scored.append((overlap, doc))
    scored.sort(key=lambda x: x[0], reverse=True)
    return [doc for _, doc in scored[:top_k]]


def generate_alternative_queries(question: str) -> list[str]:
    system_prompt = """You are a helpful assistant that generates alternative phrasings of a user question to improve document retrieval.

Generate exactly 3 alternative phrasings of the given question. Each should approach the same topic from a different angle — more specific, more general, or using different terminology.

Return output strictly as a JSON object with key \"prompts\" containing an array:
{
  \"prompts\": [
    {\"prompt\": \"string\"},
    {\"prompt\": \"string\"},
    {\"prompt\": \"string\"}
  ]
}"""
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
        prompts = []
        if isinstance(raw, dict):
            for key in raw:
                val = raw[key]
                if isinstance(val, list):
                    prompts = [
                        item["prompt"]
                        for item in val
                        if isinstance(item, dict) and "prompt" in item
                    ]
                    break
        elif isinstance(raw, list):
            prompts = [item["prompt"] for item in raw if isinstance(item, dict) and "prompt" in item]
    except Exception:
        prompts = []
    return [question] + prompts[:3]


def reciprocal_rank_fusion(rankings: list[list], k: int = 60) -> list:
    doc_scores: dict[str, float] = {}
    doc_map: dict[str, object] = {}
    for ranking in rankings:
        for idx, doc in enumerate(ranking):
            doc_id = str(doc.metadata.get("_id") or doc.page_content[:120])
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


@app.get("/ping", tags=["Health"])
def ping():
    """Lightweight wake-up endpoint for frontend cold-start ping."""
    return {"pong": True}


@app.get("/status", response_model=StatusResponse, tags=["Health"])
def status():
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
    if not file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")

    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
        contents = await file.read()
        tmp.write(contents)
        tmp_path = tmp.name

    try:
        loader = PyPDFLoader(file_path=tmp_path)
        docs = loader.load()

        if not docs:
            raise HTTPException(status_code=422, detail="PDF appears to be empty or unreadable.")

        splitter = RecursiveCharacterTextSplitter(
            chunk_size=CHUNK_SIZE,
            chunk_overlap=CHUNK_OVERLAP,
        )
        chunks = splitter.split_documents(docs)

        for chunk in chunks:
            chunk.metadata["source_filename"] = file.filename
            raw_page = chunk.metadata.get("page")
            chunk.metadata["page_number"] = (raw_page + 1) if isinstance(raw_page, int) else "unknown"

        vs = get_vector_store()
        vs.add_documents(chunks)

        return UploadResponse(
            message="PDF processed and indexed successfully.",
            filename=file.filename,
            chunks_stored=len(chunks),
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to process PDF: {str(e)}")
    finally:
        os.unlink(tmp_path)


@app.post("/ask", response_model=AskResponse, tags=["RAG"])
def ask(body: AskRequest):
    if not body.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty.")

    vs = get_vector_store()
    all_queries = generate_alternative_queries(body.question)

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

    fused_docs = reciprocal_rank_fusion(rankings)
    top_docs = keyword_rerank(body.question, fused_docs, top_k=body.top_k)

    context_parts = []
    for doc in top_docs:
        page = doc.metadata.get("page_number", "?")
        context_parts.append(f"[Page {page}]: {doc.page_content}")
    context = "\n\n".join(context_parts)

    sources = list({
        doc.metadata.get("source_filename", "Unknown")
        for doc in top_docs
    })

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
    try:
        qdrant_client.delete_collection(COLLECTION_NAME)
        ensure_collection()
        return {"message": f"Collection '{COLLECTION_NAME}' cleared successfully."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
