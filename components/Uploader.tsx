
import React, { useRef, useState, useEffect } from 'react';
import { extractTextFromPDF } from '../services/pdfService';
import { PDFData } from '../types';

interface UploaderProps {
  onPDFReady: (data: PDFData) => void;
  isLoading: boolean;
}

const Uploader: React.FC<UploaderProps> = ({ onPDFReady, isLoading }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [recentFiles, setRecentFiles] = useState<PDFData[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const stored = localStorage.getItem('askmypdf_recent');
    if (stored) {
      try {
        setRecentFiles(JSON.parse(stored).slice(0, 3));
      } catch (e) {
        console.error("Failed to load recent files");
      }
    }
  }, []);

  const handleFile = async (file: File) => {
    if (file.type !== 'application/pdf') {
      alert('Please upload a valid PDF file.');
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      alert('File size exceeds 20MB limit.');
      return;
    }
    try {
      const data = await extractTextFromPDF(file);
      onPDFReady(data);
    } catch (error) {
      console.error('Error parsing PDF:', error);
      alert('Failed to parse PDF document.');
    }
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  return (
    <div className="w-full max-w-xl">
      <div 
        className={`relative border-2 border-dashed rounded-[2rem] p-8 md:p-12 transition-all duration-500 flex flex-col items-center justify-center text-center group
          ${isDragging ? 'border-blue-500 bg-blue-50/50 scale-[1.02]' : 'border-gray-200 bg-white'}
          ${isLoading ? 'opacity-50 pointer-events-none' : 'hover:border-blue-300 hover:shadow-2xl hover:shadow-blue-50'}
        `}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          const file = e.dataTransfer.files[0];
          if (file) handleFile(file);
        }}
      >
        <input 
          type="file" 
          accept=".pdf" 
          className="hidden" 
          ref={fileInputRef} 
          onChange={onFileChange} 
        />
        
        <div className={`mb-4 p-4 rounded-3xl transition-all duration-500 ${isDragging ? 'bg-blue-600 text-white scale-110' : 'bg-blue-50 text-blue-600'}`}>
          <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
        </div>
        
        <h3 className="text-xl font-bold text-gray-900 mb-1">
          {isLoading ? 'Reading your document...' : 'Drop PDF here'}
        </h3>
        <p className="text-gray-400 text-sm mb-4 font-medium">
          PDF, DOCX, PPTX (up to 20 MB)
        </p>
        
        <button 
          onClick={() => fileInputRef.current?.click()}
          disabled={isLoading}
          className="bg-gray-900 text-white font-bold px-8 py-3 rounded-2xl transition-all hover:bg-gray-800 hover:shadow-xl active:scale-95 disabled:bg-gray-400 text-sm"
        >
          {isLoading ? 'Processing...' : 'Browse Files'}
        </button>

        {!isLoading && (
          <div className="mt-8 w-full">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-[1px] flex-1 bg-gray-100"></div>
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Or paste a link</span>
              <div className="h-[1px] flex-1 bg-gray-100"></div>
            </div>
            <input 
              type="text" 
              placeholder="https://example.com/document.pdf"
              className="w-full bg-gray-50 border-gray-100 border text-sm px-4 py-2.5 rounded-xl focus:ring-2 focus:ring-blue-100 focus:outline-none text-gray-600 placeholder:text-gray-300 transition-all"
            />
          </div>
        )}
        
        {isLoading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/80 rounded-[2rem] backdrop-blur-[2px]">
             <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-3"></div>
             <p className="text-xs font-bold text-blue-600 animate-pulse uppercase tracking-widest">Analyzing Content</p>
          </div>
        )}
      </div>

      {!isLoading && recentFiles.length > 0 && (
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Recent files:</span>
          {recentFiles.map((f, i) => (
            <button 
              key={i} 
              onClick={() => onPDFReady(f)}
              className="text-[11px] font-medium text-blue-600 hover:text-blue-700 bg-blue-50 px-3 py-1 rounded-full transition-colors border border-blue-100"
            >
              {f.name.length > 20 ? f.name.substring(0, 17) + '...' : f.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default Uploader;
