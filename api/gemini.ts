import { GoogleGenAI } from "@google/genai";

export default async function handler(req: any, res: any) {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  const { prompt, history } = req.body;

  const response = await ai.models.generateContent({
    model: "gemini-1.5-flash",
    contents: prompt,
  });

  res.json({ text: response.text });
}
