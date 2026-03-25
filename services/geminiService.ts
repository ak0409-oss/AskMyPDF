import { Message } from "../types";

const BACKEND_URL = (import.meta as any).env?.VITE_BACKEND_URL || "";

// Wake up Render on app load (free tier cold start can take 30-90s)
export const pingBackend = async (): Promise<boolean> => {
  try {
    const res = await fetch(`${BACKEND_URL}/ping`, {
      signal: AbortSignal.timeout(90_000), // wait up to 90s for cold start
    });
    return res.ok;
  } catch {
    return false;
  }
};

// Upload PDF file to FastAPI /upload endpoint
export const uploadPDF = async (file: File): Promise<string> => {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${BACKEND_URL}/upload`, {
    method: "POST",
    body: formData,
    signal: AbortSignal.timeout(120_000), // large PDFs can take a while
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Upload failed");
  }

  const data = await res.json();
  return data.filename;
};

// Ask a question via FastAPI /ask endpoint
export const askQuestion = async (
  question: string,
  topK: number = 5
): Promise<{ answer: string; sources: string[] }> => {
  const res = await fetch(`${BACKEND_URL}/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, top_k: topK }),
    signal: AbortSignal.timeout(60_000),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Ask failed");
  }

  return await res.json();
};

// Kept for backward compatibility with App.tsx summary flow
export const generateSummary = async (_text: string): Promise<string> => {
  return "Document uploaded and indexed. Ask me anything about it!";
};

// Kept for backward compatibility — now delegates to askQuestion
export const streamChat = async (
  _messages: Message[],
  _chunks: any[],
  question: string,
  onChunk: (text: string) => void
): Promise<string> => {
  const { answer } = await askQuestion(question);
  onChunk(answer);
  return answer;
};
