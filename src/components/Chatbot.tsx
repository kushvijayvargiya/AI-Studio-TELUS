import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Loader2 } from 'lucide-react';
import { ParsedDocument } from '../lib/zipParser';
import { chatWithDocuments, ChatMessage } from '../lib/gemini';
import { cn } from '../lib/utils';

interface ChatbotProps {
  documents: ParsedDocument[];
  onFileUpload?: (file: File) => void;
  isUploading?: boolean;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
}

export const Chatbot: React.FC<ChatbotProps> = ({ 
  documents, 
  onFileUpload, 
  isUploading = false,
  isExpanded: controlledIsExpanded,
  onToggleExpand
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [localIsExpanded, setLocalIsExpanded] = useState(true);
  
  const isExpanded = controlledIsExpanded !== undefined ? controlledIsExpanded : localIsExpanded;
  
  const handleToggle = () => {
    if (onToggleExpand) {
      onToggleExpand();
    } else {
      setLocalIsExpanded(!isExpanded);
    }
  };

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMsg = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setIsLoading(true);

    try {
      const response = await chatWithDocuments(documents, messages, userMsg);
      setMessages(prev => [...prev, { role: 'model', text: response }]);
    } catch (error) {
      console.error("Chat error:", error);
      setMessages(prev => [...prev, { role: 'model', text: "Sorry, I encountered an error while processing your request." }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={cn(
      "flex flex-col bg-bg-secondary rounded-3xl overflow-hidden relative transition-all duration-300",
      isExpanded 
        ? "h-[600px] xl:h-[calc(100vh-8rem)] shadow-lg shadow-telus-purple/5 border border-border-primary" 
        : "h-[74px] shadow-[0_20px_60px_-15px_rgba(75,40,109,0.4)] border border-telus-purple/30 cursor-pointer hover:border-telus-purple/60 hover:-translate-y-1"
    )}>
      <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent pointer-events-none" />
      
      <div 
        className="p-5 border-b border-border-primary bg-bg-secondary/80 backdrop-blur-md flex items-center justify-between z-10 cursor-pointer hover:bg-bg-primary/50 transition-colors"
        onClick={handleToggle}
      >
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-telus-purple/10 rounded-xl border border-border-primary shadow-sm">
            <Bot className="w-5 h-5 text-telus-purple" />
          </div>
          <div>
            <h3 className="font-bold text-telus-gray leading-tight">Contract Assistant</h3>
            <p className="text-[11px] font-medium text-text-secondary uppercase tracking-wider flex items-center">
              AI Powered {isUploading && <span className="ml-2 text-telus-purple animate-pulse">Uploading file...</span>}
            </p>
          </div>
        </div>
        <button
          className="p-2 justify-center items-center flex rounded-full hover:bg-bg-primary text-text-secondary transition-colors"
        >
          <img 
            src={isExpanded ? "https://api.iconify.design/lucide:chevron-down.svg?color=%23666" : "https://api.iconify.design/lucide:chevron-up.svg?color=%23666"} 
            className="w-5 h-5" 
            alt="Toggle Chat" 
          />
        </button>
      </div>
      
      {isExpanded && (
        <>
          <div className="flex-1 overflow-y-auto p-6 space-y-6 z-10 scroll-smooth bg-bg-primary/30">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-4 opacity-70">
            <div className="w-16 h-16 bg-bg-primary rounded-full flex items-center justify-center border border-border-primary shadow-sm">
              <Bot className="w-8 h-8 text-text-secondary/50" />
            </div>
            <div>
              <p className="text-text-secondary font-medium">How can I help you today?</p>
              <p className="text-text-secondary/60 text-sm mt-1">Ask me anything about the uploaded contracts.</p>
            </div>
          </div>
        )}
        
        {messages.map((msg, idx) => (
          <div key={idx} className={cn(
            "flex max-w-[85%] space-x-3",
            msg.role === 'user' ? "ml-auto flex-row-reverse space-x-reverse" : "mr-auto"
          )}>
            <div className={cn(
              "shrink-0 w-8 h-8 rounded-full flex items-center justify-center shadow-sm border",
              msg.role === 'user' 
                ? "bg-telus-purple/10 text-telus-purple border-border-primary" 
                : "bg-bg-secondary text-text-secondary border-border-primary"
            )}>
              {msg.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
            </div>
            <div className={cn(
              "p-4 rounded-2xl text-[15px] leading-relaxed whitespace-pre-wrap shadow-sm border",
              msg.role === 'user' 
                ? "bg-telus-purple text-white rounded-tr-sm border-telus-purple font-medium" 
                : "bg-bg-secondary text-text-secondary rounded-tl-sm border-border-primary"
            )}>
              {msg.text}
            </div>
          </div>
        ))}
        
          {isLoading && (
            <div className="flex max-w-[85%] space-x-3 mr-auto">
              <div className="shrink-0 w-8 h-8 rounded-full bg-bg-secondary text-text-secondary border border-border-primary shadow-sm flex items-center justify-center">
                <Bot className="w-4 h-4" />
              </div>
              <div className="p-4 rounded-2xl text-[15px] bg-bg-secondary text-text-secondary/60 rounded-tl-sm border border-border-primary shadow-sm flex items-center space-x-3">
                <Loader2 className="w-4 h-4 animate-spin text-telus-purple" />
                <span className="font-medium">Analyzing documents...</span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <form onSubmit={handleSubmit} className="p-4 border-t border-border-primary bg-bg-secondary/80 backdrop-blur-md z-10">
        <div className="relative flex items-center">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a question about the contracts..."
            className="flex-1 pl-5 pr-20 py-3.5 bg-bg-primary border border-border-primary rounded-2xl text-[15px] text-telus-gray placeholder:text-text-secondary/50 focus:outline-none focus:ring-2 focus:ring-telus-purple/20 focus:border-telus-purple transition-all shadow-inner"
            disabled={isLoading || isUploading}
          />
          <div className="absolute right-2 flex items-center space-x-1">
            {onFileUpload && (
              <>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isLoading || isUploading}
                  className="p-2 text-text-secondary hover:text-telus-purple hover:bg-telus-purple/10 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Upload additional document"
                >
                  <img src="https://api.iconify.design/lucide:paperclip.svg?color=%23666" alt="Upload file" className="w-4 h-4" />
                </button>
                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file && onFileUpload) {
                      onFileUpload(file);
                    }
                    if (e.target) {
                      e.target.value = '';
                    }
                  }}
                />
              </>
            )}
            <button
              type="submit"
              disabled={!input.trim() || isLoading || isUploading}
              className="p-2 bg-telus-purple text-white rounded-xl hover:bg-telus-purple/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm hover:shadow-md hover:-translate-y-0.5 active:translate-y-0"
            >
              <Send className="w-4 h-4 ml-0.5" />
            </button>
          </div>
        </div>
      </form>
        </>
      )}
    </div>
  );
};
