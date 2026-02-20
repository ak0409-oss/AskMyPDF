
import React from 'react';
import { Message } from '../types';

interface ChatMessageProps {
  message: Message;
}

const ChatMessage: React.FC<ChatMessageProps> = ({ message }) => {
  const isModel = message.role === 'model';
  
  return (
    <div className={`flex w-full mb-6 ${isModel ? 'justify-start' : 'justify-end'}`}>
      <div className={`max-w-[85%] md:max-w-[70%] rounded-2xl p-4 shadow-sm ${
        isModel 
          ? 'bg-white border border-gray-100 text-gray-800' 
          : 'bg-blue-600 text-white'
      }`}>
        <div className="flex items-center mb-1">
          <span className="text-xs font-bold uppercase tracking-wider opacity-60">
            {isModel ? 'Gemini AI' : 'You'}
          </span>
        </div>
        <div className="prose prose-sm max-w-none prose-slate whitespace-pre-wrap leading-relaxed">
          {message.content || '...'}
        </div>
      </div>
    </div>
  );
};

export default ChatMessage;
