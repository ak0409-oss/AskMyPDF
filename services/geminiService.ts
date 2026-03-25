import { Message } from "../types";

const BACKEND_URL = (import.meta as any).env?.VITE_BACKEND_URL || "";

// Upload PDF file to FastAPI /upload endpoint
export const uploadPDF = async (file: File): Promise<string> => {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${BACKEND_URL}/upload`, {
    method: "POST",
    body: formData,
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
