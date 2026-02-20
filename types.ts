
export interface Message {
  role: 'user' | 'model';
  content: string;
}

export interface PDFData {
  name: string;
  text: string;
  pageCount: number;
  summary?: string;
  timestamp?: number;
}

export type AppTheme = 'light' | 'dark' | 'system';
export type AppLanguage = 'en' | 'es' | 'fr' | 'de';
