import React, { useState, useRef, useEffect } from 'react';
import { ContractAnalysisResult, chatWithContract } from '../lib/gemini';
import { MessageSquare, Send, Bot, User, Loader2, Sparkles, X } from 'lucide-react';
import { cn } from '../lib/utils';
import ReactMarkdown from 'react-markdown';

interface ChatWithContractProps {
  result: ContractAnalysisResult;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export const ChatWithContract: React.FC<ChatWithContractProps> = ({ result }) => {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: "Hi! I've analyzed your contract documents. Ask me anything about the terms, pricing, or service details." }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;
    
    const userQuery = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userQuery }]);
    setIsLoading(true);
    
    try {
      const answer = await chatWithContract(userQuery, result);
      setMessages(prev => [...prev, { role: 'assistant', content: answer }]);
    } catch (error) {
      console.error('Chat error:', error);
      setMessages(prev => [...prev, { role: 'assistant', content: "Sorry, I encountered an error while processing your request." }]);
    } finally {
      setIsLoading(false);
    }
  };

  const suggestedQuestions = [
    "What is the total monthly revenue?",
    "Which services are unsigned?",
    "When does the main contract expire?",
    "Are there any orphan services?"
  ];

  return (
    <div className="flex flex-col h-[600px] telus-card overflow-hidden bg-bg-secondary border-border-primary">
      {/* Header */}
      <div className="p-4 border-b border-border-primary bg-bg-secondary flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <div className="p-1.5 bg-telus-purple/10 text-telus-purple rounded-lg">
            <MessageSquare className="w-4 h-4" />
          </div>
          <h3 className="font-bold text-telus-gray">Chat with your Contracts</h3>
        </div>
        <div className="flex items-center space-x-1.5 text-[10px] font-bold text-telus-purple uppercase tracking-widest bg-telus-purple/10 px-2 py-0.5 rounded-full border border-telus-purple/20">
          <Sparkles className="w-3 h-3" />
          <span>Powered by Gemini</span>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-bg-primary/30">
        {messages.map((msg, idx) => (
          <div key={idx} className={cn(
            "flex items-start space-x-3 max-w-[85%]",
            msg.role === 'user' ? "ml-auto flex-row-reverse space-x-reverse" : ""
          )}>
            <div className={cn(
              "p-2 rounded-xl shrink-0",
              msg.role === 'assistant' ? "bg-telus-purple/10 text-telus-purple" : "bg-telus-gray text-white"
            )}>
              {msg.role === 'assistant' ? <Bot className="w-4 h-4" /> : <User className="w-4 h-4" />}
            </div>
            <div className={cn(
              "p-4 rounded-2xl text-sm shadow-sm",
              msg.role === 'assistant' ? "bg-bg-secondary text-text-secondary border border-border-primary" : "bg-telus-purple text-white"
            )}>
              <div className={cn(
                "prose prose-sm max-w-none",
                msg.role === 'assistant' ? "prose-slate dark:prose-invert" : "prose-invert"
              )}>
                <ReactMarkdown>{msg.content}</ReactMarkdown>
              </div>
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex items-start space-x-3">
            <div className="p-2 rounded-xl bg-telus-purple/10 text-telus-purple shrink-0">
              <Bot className="w-4 h-4" />
            </div>
            <div className="bg-bg-secondary p-4 rounded-2xl border border-border-primary shadow-sm flex items-center space-x-2">
              <Loader2 className="w-4 h-4 animate-spin text-telus-purple" />
              <span className="text-sm text-text-secondary italic">Thinking...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-border-primary bg-bg-secondary">
        {messages.length === 1 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {suggestedQuestions.map((q, idx) => (
              <button
                key={idx}
                onClick={() => setInput(q)}
                className="text-[11px] font-medium text-text-secondary bg-bg-primary hover:bg-bg-secondary px-3 py-1.5 rounded-full transition-colors border border-border-primary"
              >
                {q}
              </button>
            ))}
          </div>
        )}
        <div className="flex items-center space-x-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Ask a question about your contracts..."
            className="flex-1 bg-bg-primary border border-border-primary rounded-xl px-4 py-2.5 text-sm text-telus-gray placeholder:text-text-secondary/50 focus:outline-none focus:ring-2 focus:ring-telus-purple/20 focus:border-telus-purple transition-all"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className={cn(
              "p-2.5 rounded-xl transition-all shadow-sm",
              !input.trim() || isLoading 
                ? "bg-bg-primary text-text-secondary/30 cursor-not-allowed border border-border-primary" 
                : "bg-telus-purple text-white hover:bg-telus-purple/90 active:scale-95 shadow-lg shadow-telus-purple/20"
            )}
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
};
