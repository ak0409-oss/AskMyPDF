import React, { useState, useRef, useEffect } from 'react';
import Uploader from './components/Uploader';
import ChatMessage from './components/ChatMessage';
import { Message, PDFData } from './types';
import { streamChat, generateSummary } from './services/geminiService';

const GeminiLogo = ({ dark }: { dark: boolean }) => (
  <div className={`flex items-center gap-1.5 font-medium ${dark ? 'text-gray-400' : 'text-gray-500'}`}>
    <span className="text-[10px] uppercase tracking-wider font-bold">powered by</span>
    <div className="flex items-center gap-1">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z" fill="url(#gemini-grad)" />
        <defs>
          <linearGradient id="gemini-grad" x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
            <stop stopColor="#4285F4" />
            <stop offset="0.5" stopColor="#9B72CB" />
            <stop offset="1" stopColor="#D96570" />
          </linearGradient>
        </defs>
      </svg>
      <span className={`font-bold tracking-tight text-sm ${dark ? 'text-white' : 'text-gray-900'}`}>Gemini</span>
    </div>
  </div>
);

const AppLogoHero = () => (
  <div className="relative h-40 w-full flex items-center justify-center mb-6 doc-stack-animation">
    <div className="absolute transform -rotate-12 translate-x-[-35px] w-20 h-28 bg-orange-500 rounded-lg shadow-lg flex flex-col p-2.5 border-2 border-white/20">
      <span className="text-[9px] font-bold text-white mb-1.5">pdf</span>
      <div className="w-full h-1 bg-white/40 rounded mb-1"></div>
      <div className="w-2/3 h-1 bg-white/40 rounded"></div>
    </div>
    <div className="absolute z-10 w-20 h-28 bg-blue-400 rounded-lg shadow-xl flex flex-col p-2.5 border-2 border-white/20">
      <span className="text-[9px] font-bold text-white mb-1.5">doc</span>
      <div className="w-full h-1 bg-white/60 rounded mb-1"></div>
      <div className="w-full h-1 bg-white/60 rounded mb-1"></div>
      <div className="w-3/4 h-1 bg-white/60 rounded"></div>
    </div>
    <div className="absolute transform rotate-12 translate-x-[35px] w-20 h-28 bg-yellow-400 rounded-lg shadow-lg flex flex-col p-2.5 border-2 border-white/20">
      <span className="text-[9px] font-bold text-white mb-1.5">PPT</span>
      <div className="w-full h-10 bg-white/30 rounded mb-1.5"></div>
      <div className="w-1/2 h-1 bg-white/40 rounded"></div>
    </div>
  </div>
);

const App: React.FC = () => {
  const [pdfData, setPdfData] = useState<PDFData | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [insightsOpen, setInsightsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  const saveToRecent = (data: PDFData) => {
    const stored = localStorage.getItem('askmypdf_recent');
    let recent: PDFData[] = [];
    if (stored) {
      try { recent = JSON.parse(stored); } catch (e) {}
    }
    recent = [data, ...recent.filter(f => f.name !== data.name)].slice(0, 10);
    localStorage.setItem('askmypdf_recent', JSON.stringify(recent));
  };

  const handlePDFReady = async (data: PDFData) => {
    setIsParsing(true);
    try {
      const summary = await generateSummary(data.text);
      const dataWithSummary = { ...data, summary, timestamp: Date.now() };
      setPdfData(dataWithSummary);
      saveToRecent(dataWithSummary);
      setMessages([{
        role: 'model',
        content: `I've analyzed **${data.name}**. I'm ready to help you with anything related to this document!`
      }]);
    } catch (e) {
      setPdfData(data);
      setMessages([{ role: 'model', content: "Document parsed! How can I help?" }]);
    } finally {
      setIsParsing(false);
    }
  };

  const handleSendMessage = async (text: string) => {
    if (!text.trim() || isTyping || !pdfData) return;
    const userMessage: Message = { role: 'user', content: text };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsTyping(true);
    let currentResponse = '';
    setMessages(prev => [...prev, { role: 'model', content: '' }]);
    try {
      await streamChat([...messages, userMessage], pdfData.chunks, text, (chunk) => {
        currentResponse += chunk;
        setMessages(prev => {
          const rest = prev.slice(0, -1);
          return [...rest, { role: 'model', content: currentResponse }];
        });
      });
    } catch (error) {
      setMessages(prev => [
        ...prev.slice(0, -1),
        { role: 'model', content: 'Processing error. Please verify your Gemini API key.' }
      ]);
    } finally {
      setIsTyping(false);
    }
  };

  const starterPrompts = [
    "Summarize this document",
    "Extract all key dates & deadlines",
    "List the top 5 key takeaways",
    "Who are the main stakeholders?"
  ];

  const d = darkMode;

  return (
    <div className={`min-h-screen flex flex-col font-['Inter'] relative overflow-x-hidden transition-colors duration-300 ${d ? 'bg-gray-950 text-white' : 'bg-gray-50 text-gray-900'}`}>
      {/* Top Bar */}
      <div className={`text-[10px] py-1.5 text-center font-bold uppercase tracking-widest px-4 border-b z-30 ${d ? 'bg-gray-900 text-gray-500 border-white/5' : 'bg-gray-900 text-gray-400 border-white/5'}`}>
        All processing happens in your browser. No files are stored on our servers.
      </div>

      {/* Header */}
      <header className={`backdrop-blur-md border-b sticky top-0 z-20 px-6 py-4 transition-colors duration-300 ${d ? 'bg-gray-900/90 border-white/10' : 'bg-white/80 border-gray-200'}`}>
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 p-2 rounded-xl shadow-blue-200 shadow-lg cursor-pointer" onClick={() => { setPdfData(null); setMessages([]); }}>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
            </div>
            <h1 className={`text-xl font-black tracking-tight leading-none ${d ? 'text-white' : 'text-gray-900'}`}>AskMyPDF</h1>
          </div>

          <div className="flex items-center gap-6">
            <div className="hidden md:block"><GeminiLogo dark={d} /></div>
            <button
              onClick={() => setSettingsOpen(!settingsOpen)}
              className={`p-2 rounded-full transition-colors relative ${d ? 'hover:bg-gray-800 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              {settingsOpen && (
                <div className={`absolute right-0 top-full mt-2 w-52 border rounded-2xl shadow-xl py-2 z-50 text-left ${d ? 'bg-gray-800 border-white/10' : 'bg-white border-gray-200'}`}>
                  <div className={`px-4 py-2 border-b text-[10px] font-bold uppercase tracking-widest ${d ? 'text-gray-500 border-white/10' : 'text-gray-400 border-gray-100'}`}>Preferences</div>
                  <button
                    onClick={() => setDarkMode(!d)}
                    className={`w-full text-left px-4 py-2 text-sm font-medium flex items-center justify-between ${d ? 'hover:bg-gray-700 text-white' : 'hover:bg-gray-50 text-gray-700'}`}
                  >
                    Dark Mode
                    <span className={`w-8 h-4 rounded-full transition-colors flex items-center px-0.5 ${d ? 'bg-blue-500' : 'bg-gray-300'}`}>
                      <span className={`w-3 h-3 bg-white rounded-full shadow transition-transform ${d ? 'translate-x-4' : 'translate-x-0'}`} />
                    </span>
                  </button>
                  <button className={`w-full text-left px-4 py-2 text-sm font-medium ${d ? 'hover:bg-gray-700 text-white' : 'hover:bg-gray-50 text-gray-700'}`}>Model: Flash 2.5</button>
                  <button className={`w-full text-left px-4 py-2 text-sm font-medium ${d ? 'hover:bg-gray-700 text-white' : 'hover:bg-gray-50 text-gray-700'}`}>Language: EN</button>
                  <div className={`h-[1px] my-1 ${d ? 'bg-white/10' : 'bg-gray-100'}`}></div>
                  <button className="w-full text-left px-4 py-2 text-sm font-bold text-red-500 hover:bg-red-50">Logout</button>
                </div>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-4 md:p-8 flex flex-col md:flex-row gap-6 overflow-hidden">
        {!pdfData ? (
          <div className="flex-1 flex flex-col items-center justify-center animate-in fade-in slide-in-from-bottom-4 duration-700">
            <AppLogoHero />
            <div className="w-full max-w-xl text-center">
              <div className="mb-8">
                <h2 className={`text-4xl font-black mb-3 tracking-tighter ${d ? 'text-white' : 'text-gray-900'}`}>Interact with your documents</h2>
                <p className={`text-lg font-medium mb-4 ${d ? 'text-gray-400' : 'text-gray-500'}`}>The smartest way to chat with PDFs and presentations.</p>
              </div>
              <Uploader onPDFReady={handlePDFReady} isLoading={isParsing} />
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col min-w-0">
            <div className={`border rounded-3xl p-5 mb-6 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4 animate-in fade-in slide-in-from-top-4 duration-500 ${d ? 'bg-gray-900 border-white/10' : 'bg-white border-gray-200'}`}>
              <div className="flex items-center gap-4 flex-1">
                <div className={`w-12 h-14 rounded-xl flex items-center justify-center border shrink-0 ${d ? 'bg-blue-900 text-blue-400 border-blue-800' : 'bg-blue-50 text-blue-600 border-blue-100'}`}>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className={`font-bold truncate max-w-[200px] ${d ? 'text-white' : 'text-gray-900'}`}>{pdfData.name}</h3>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${d ? 'bg-gray-700 text-gray-400' : 'bg-gray-100 text-gray-500'}`}>{pdfData.pageCount} Pages</span>
                  </div>
                  <p className={`text-xs font-medium italic mt-0.5 line-clamp-1 ${d ? 'text-gray-500' : 'text-gray-500'}`}>"{pdfData.summary}"</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setInsightsOpen(!insightsOpen)}
                  className={`text-[10px] font-bold px-4 py-2 rounded-xl border transition-all uppercase tracking-widest flex items-center gap-2 ${insightsOpen ? 'bg-blue-600 border-blue-600 text-white shadow-lg' : d ? 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                >
                  Insights
                </button>
                <button
                  onClick={() => { setPdfData(null); setMessages([]); }}
                  className={`text-[10px] font-bold px-4 py-2 rounded-xl border transition-all uppercase tracking-widest ${d ? 'bg-gray-800 border-gray-700 text-gray-400 hover:text-red-400 hover:border-red-800' : 'bg-gray-50 border-gray-200 text-gray-400 hover:text-red-500 hover:border-red-100'}`}
                >
                  Change file
                </button>
              </div>
            </div>

            <div className="flex-1 flex gap-6 overflow-hidden">
              <div className={`flex-1 flex flex-col rounded-3xl shadow-2xl overflow-hidden border relative ${d ? 'bg-gray-900 border-white/10 shadow-black/30' : 'bg-white border-gray-100 shadow-blue-50/50'}`}>
                <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 md:p-8 space-y-2">
                  {messages.map((msg, idx) => (
                    <ChatMessage key={idx} message={msg} darkMode={d} />
                  ))}
                  {isTyping && messages[messages.length - 1].role === 'user' && (
                    <div className="flex justify-start mb-6">
                      <div className={`rounded-2xl px-5 py-3 border flex items-center gap-2 ${d ? 'bg-gray-800 border-white/10' : 'bg-gray-50 border-gray-100'}`}>
                        <div className="flex gap-1.5">
                          <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                          <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                          <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce"></div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className={`p-4 md:p-6 border-t transition-colors ${d ? 'bg-gray-900 border-white/10' : 'bg-white border-gray-100'}`}>
                  <div className="flex flex-wrap gap-2 mb-4">
                    {starterPrompts.map((prompt, i) => (
                      <button
                        key={i}
                        onClick={() => handleSendMessage(prompt)}
                        className={`text-[11px] font-bold px-3 py-1.5 rounded-full border transition-all ${d ? 'text-gray-400 bg-gray-800 border-gray-700 hover:bg-blue-900 hover:text-blue-300 hover:border-blue-800' : 'text-gray-600 bg-gray-50 border-gray-100 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-100'}`}
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                  <form
                    onSubmit={(e) => { e.preventDefault(); handleSendMessage(input); }}
                    className={`flex items-center gap-3 p-2 pl-5 rounded-2xl border transition-all ${d ? 'bg-gray-800 border-gray-700 focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-900' : 'bg-gray-50 border-gray-200 focus-within:border-blue-400 focus-within:ring-4 focus-within:ring-blue-50'}`}
                  >
                    <input
                      type="text"
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      placeholder="Ask a question..."
                      className={`flex-1 bg-transparent border-none focus:ring-0 py-3 font-medium placeholder:text-gray-400 ${d ? 'text-white' : 'text-gray-800'}`}
                      disabled={isTyping}
                    />
                    <div className="flex items-center gap-2 pr-1">
                      <div className={`hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[9px] font-black uppercase tracking-widest ${d ? 'bg-gray-700 border-gray-600 text-gray-400' : 'bg-white border-gray-200 text-gray-500'}`}>
                        <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>
                        Gemini 2.5 Flash
                      </div>
                      <button
                        type="submit"
                        disabled={!input.trim() || isTyping}
                        className={`p-3 rounded-xl transition-all shadow-lg ${!input.trim() || isTyping ? 'bg-gray-200 text-gray-400' : 'bg-blue-600 text-white hover:bg-blue-700 hover:shadow-blue-200 active:scale-95'}`}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                          <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
                        </svg>
                      </button>
                    </div>
                  </form>
                </div>
              </div>

              {insightsOpen && (
                <div className={`w-72 rounded-3xl border shadow-xl overflow-hidden flex flex-col animate-in slide-in-from-right-10 duration-500 ${d ? 'bg-gray-900 border-white/10' : 'bg-white border-gray-100'}`}>
                  <div className={`p-5 border-b flex items-center justify-between ${d ? 'bg-gray-800/50 border-white/10' : 'bg-gray-50/50 border-gray-100'}`}>
                    <h3 className={`font-black text-xs uppercase tracking-widest ${d ? 'text-white' : 'text-gray-900'}`}>Document Insights</h3>
                    <button onClick={() => setInsightsOpen(false)} className={d ? 'text-gray-500 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600'}>
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-5 space-y-6">
                    <div>
                      <h4 className={`text-[10px] font-bold uppercase tracking-widest mb-3 ${d ? 'text-gray-500' : 'text-gray-400'}`}>Automatic Outline</h4>
                      <ul className="space-y-2">
                        {["Introduction", "Key Objectives", "Proposed Timeline", "Budget Analysis", "Conclusion"].map((item, i) => (
                          <li key={i} className={`flex items-center gap-2 text-xs font-medium cursor-pointer hover:text-blue-500 ${d ? 'text-gray-400' : 'text-gray-700'}`}>
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span>{item}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <h4 className={`text-[10px] font-bold uppercase tracking-widest mb-3 ${d ? 'text-gray-500' : 'text-gray-400'}`}>Key Entities</h4>
                      <div className="flex flex-wrap gap-1.5">
                        {["Stakeholders", "Deadlines", "Financials", "Compliance"].map((tag, i) => (
                          <span key={i} className={`px-2 py-1 text-[9px] font-bold rounded-md border ${d ? 'bg-gray-800 text-gray-400 border-gray-700' : 'bg-gray-100 text-gray-600 border-gray-200'}`}>{tag}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      <footer className={`py-10 px-6 text-center border-t transition-colors ${d ? 'bg-gray-900 border-white/10' : 'bg-white border-gray-200'}`}>
        <div className="max-w-6xl mx-auto flex flex-col items-center gap-3">
          <GeminiLogo dark={d} />
          <p className={`text-[9px] font-bold uppercase tracking-widest ${d ? 'text-gray-600' : 'text-gray-400'}`}>No data is used to train Gemini; processing is session-based only.</p>
          <div className="flex items-center gap-8 mt-4">
            {["Privacy", "Terms", "Feedback", "Github"].map((link, i) => (
              <a key={i} href="#" className={`text-[10px] font-bold uppercase tracking-[0.2em] hover:text-blue-500 transition-colors ${d ? 'text-gray-500' : 'text-gray-500'}`}>{link}</a>
            ))}
          </div>
          <p className={`text-[10px] font-bold uppercase tracking-widest mt-6 ${d ? 'text-gray-700' : 'text-gray-300'}`}>AskMyPDF — Secure & Fast Document Intelligence © 2024</p>
        </div>
      </footer>
    </div>
  );
};

export default App;
