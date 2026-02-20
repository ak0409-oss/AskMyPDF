
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { Message } from "../types";

const getAIClient = () => {
  return new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
};

export const generateSummary = async (text: string): Promise<string> => {
  const ai = getAIClient();
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: [{ role: 'user', parts: [{ text: `Provide a very concise one-sentence summary (max 15 words) of the following text:\n\n${text.substring(0, 5000)}` }] }],
    config: { temperature: 0.1 }
  });
  return response.text?.trim() || "Document analyzed successfully.";
};

export const streamChat = async (
  messages: Message[],
  context: string,
  onChunk: (text: string) => void
) => {
  const ai = getAIClient();
  const model = ai.models.generateContentStream({
    model: 'gemini-3-flash-preview',
    contents: [
      {
        role: 'user',
        parts: [{ text: `CONTEXT FROM PDF DOCUMENT:\n${context}` }]
      },
      ...messages.map(m => ({
        role: m.role,
        parts: [{ text: m.content }]
      }))
    ],
    config: {
      systemInstruction: "You are a professional PDF analyst. Use the provided context to answer the user's questions accurately. If the answer is not in the context, say you don't know based on the document, but try to be as helpful as possible. Use markdown for formatting.",
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
