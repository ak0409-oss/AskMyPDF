import { PDFData } from '../types';
import { uploadPDF } from './geminiService';

// Upload the PDF to the FastAPI backend for server-side processing.
// The backend handles text extraction, chunking, embedding, and Qdrant indexing.
// The frontend only needs the filename back for display purposes.
export const extractTextFromPDF = async (file: File): Promise<PDFData> => {
  const filename = await uploadPDF(file);
  return {
    name: filename,
    text: "",       // text lives in Qdrant now, not the browser
    chunks: [],     // chunks live in Qdrant now, not the browser
    pageCount: 0,   // not needed for backend RAG
  };
};
