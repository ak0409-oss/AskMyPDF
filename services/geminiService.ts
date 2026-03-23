import { Message, Chunk } from "../types";

function retrieveTopChunks(question: string, chunks: Chunk[], topK = 4): Chunk[] {
  const qWords = new Set(question.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  const scored = chunks.map(chunk => {
    const cWords = chunk.text.toLowerCase().split(/\s+/);
    const overlap = cWords.filter(w => qWords.has(w)).length;
    return { chunk, score: overlap };
  });
  return scored.sort((a, b) => b.score - a.score).slice(0, topK).map(s => s.chunk);
}

export const generateSummary = async (text: string): Promise<string> => {
  const res = await fetch("/api/gemini", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: `Provide a very concise one-sentence summary (max 15 words) of the following text:\n\n${text.substring(0, 5000)}`,
    }),
  });
  const data = await res.json();
  return data.text?.trim() || "Document analyzed successfully.";
};

export const streamChat = async (
  messages: Message[],
  chunks: Chunk[],
  question: string,
  onChunk: (text: string) => void
) => {
  const relevant = retrieveTopChunks(question, chunks, 4);
  const context = relevant.map(c => `[Page ${c.pageNumber}]: ${c.text}`).join('\n\n');

  const res = await fetch("/api/gemini", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: `You are a professional PDF analyst. Use only the provided context to answer. Always cite page numbers. Use markdown for formatting.\n\nRELEVANT CONTEXT FROM PDF:\n${context}\n\nQuestion: ${question}`,
      history: messages.slice(0, -1).map(m => ({ role: m.role, content: m.content })),
    }),
  });
  const data = await res.json();
  onChunk(data.text || "");
  return data.text || "";
};
