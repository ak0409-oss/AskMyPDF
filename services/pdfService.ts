import { PDFData, Chunk } from '../types';

declare const pdfjsLib: any;

pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

export const extractTextFromPDF = async (file: File): Promise<PDFData> => {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let fullText = '';
  const chunks: Chunk[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items.map((item: any) => item.str).join(' ');
    fullText += pageText + '\n';
    if (pageText.trim().length > 50) {
      chunks.push({ text: pageText, pageNumber: i, index: i - 1 });
    }
  }

  return {
    name: file.name,
    text: fullText,
    chunks,
    pageCount: pdf.numPages
  };
<<<<<<< Updated upstream
};
=======
};
>>>>>>> Stashed changes
