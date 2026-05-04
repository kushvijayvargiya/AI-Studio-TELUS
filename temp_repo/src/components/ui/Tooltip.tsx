import React, { useState } from 'react';
import { cn } from '../../lib/utils';

interface TooltipProps {
  content: string;
  children: React.ReactNode;
  className?: string;
}

export const Tooltip: React.FC<TooltipProps> = ({ content, children, className }) => {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <div 
      className="relative inline-block group"
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
    >
      {children}
      {isVisible && (
        <div className={cn(
          "absolute bottom-full left-1/2 -translate-x-1/2 mb-3 px-4 py-2.5 bg-[#FFFFFFF2] backdrop-blur-md text-telus-gray text-[10px] font-black uppercase tracking-widest rounded-xl shadow-[0_20px_50px_rgba(75,40,109,0.15)] z-50 whitespace-nowrap animate-in fade-in zoom-in-95 duration-200 border border-[#4B286D1A]",
          className
        )}>
          {content}
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-[#FFFFFFF2]" />
        </div>
      )}
    </div>
  );
};
