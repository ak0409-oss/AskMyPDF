import { GoogleGenerativeAI } from "@google/generative-ai";

export default async function handler(req: any, res: any) {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
  const { prompt, history } = req.body;

  if (history && history.length > 0) {
    const chat = model.startChat({
      history: history.map((m: any) => ({
        role: m.role,
        parts: [{ text: m.content }],
      })),
    });
    const result = await chat.sendMessage(prompt);
    res.json({ text: result.response.text() });
  } else {
    const result = await model.generateContent(prompt);
    res.json({ text: result.response.text() });
  }
}
