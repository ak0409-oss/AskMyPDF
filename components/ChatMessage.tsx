import React from 'react';
import { Message } from '../types';

interface ChatMessageProps {
  message: Message;
}

function renderMarkdown(text: string): React.ReactNode[] {
  const lines = text.split('\n');
  const result: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Empty line
    if (line.trim() === '') {
      result.push(<br key={i} />);
      i++;
      continue;
    }

    // Bullet point
    if (line.match(/^[*-]\s+/)) {
      const items: React.ReactNode[] = [];
      while (i < lines.length && lines[i].match(/^[*-]\s+/)) {
        items.push(<li key={i} className="ml-4 list-disc">{renderInline(lines[i].replace(/^[*-]\s+/, ''))}</li>);
        i++;
      }
      result.push(<ul key={`ul-${i}`} className="my-2 space-y-1">{items}</ul>);
      continue;
    }

    // Heading
    const h3 = line.match(/^###\s+(.+)/);
    const h2 = line.match(/^##\s+(.+)/);
    const h1 = line.match(/^#\s+(.+)/);
    if (h3) { result.push(<h3 key={i} className="font-bold text-base mt-3 mb-1">{renderInline(h3[1])}</h3>); i++; continue; }
    if (h2) { result.push(<h2 key={i} className="font-bold text-lg mt-3 mb-1">{renderInline(h2[1])}</h2>); i++; continue; }
    if (h1) { result.push(<h1 key={i} className="font-bold text-xl mt-3 mb-1">{renderInline(h1[1])}</h1>); i++; continue; }

    // Regular paragraph
    result.push(<p key={i} className="leading-relaxed">{renderInline(line)}</p>);
    i++;
  }

  return result;
}

function renderInline(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} className="font-bold">{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('*') && part.endsWith('*')) {
      return <em key={i}>{part.slice(1, -1)}</em>;
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={i} className="bg-gray-100 px-1 py-0.5 rounded text-xs font-mono">{part.slice(1, -1)}</code>;
    }
    return part;
  });
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
        <div className="text-sm space-y-1">
          {message.content ? renderMarkdown(message.content) : '...'}
        </div>
      </div>
    </div>
  );
};

export default ChatMessage;
