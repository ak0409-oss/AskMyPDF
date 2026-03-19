import { GoogleGenAI } from "@google/genai";
import { Message, Chunk } from "../types";

const getAIClient = () => {
  return new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
};

function retrieveTopChunks(question: string, chunks: Chunk[], topK = 4): Chunk[] {
  const qWords = new Set(question.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  const scored = chunks.map(chunk => {
    const cWords = chunk.text.toLowerCase().split(/\s+/);
    const overlap = cWords.filter(w => qWords.has(w)).length;
    return { chunk, score: overlap };
  });
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map(s => s.chunk);
}

export const generateSummary = async (text: string): Promise<string> => {
  const ai = getAIClient();
  const response = await ai.models.generateContent({
    model: 'gemini-2.0-flash',
    contents: [{ role: 'user', parts: [{ text: `Provide a very concise one-sentence summary (max 15 words) of the following text:\n\n${text.substring(0, 5000)}` }] }],
    config: { temperature: 0.1 }
  });
  return response.text?.trim() || "Document analyzed successfully.";
};

export const streamChat = async (
  messages: Message[],
  chunks: Chunk[],
  question: string,
  onChunk: (text: string) => void
) => {
  const ai = getAIClient();
  const relevant = retrieveTopChunks(question, chunks, 4);
  const context = relevant.map(c => `[Page ${c.pageNumber}]: ${c.text}`).join('\n\n');

  const model = ai.models.generateContentStream({
    model: 'gemini-2.0-flash',
    contents: [
      {
        role: 'user',
        parts: [{ text: `RELEVANT CONTEXT FROM PDF:\n${context}` }]
      },
      ...messages.map(m => ({
        role: m.role,
        parts: [{ text: m.content }]
      }))
    ],
    config: {
      systemInstruction: "You are a professional PDF analyst. Use only the provided context to answer. Always cite the page number when referencing information, e.g. (Page 3). If the answer isn't in the context, say so clearly. Use markdown for formatting.",
      temperature: 0.4,
    }
  });

  let fullResponse = '';
  for await (const chunk of await model) {
    const text = chunk.text || '';
    fullResponse += text;
    onChunk(text);
  }
  return fullResponse;
};
