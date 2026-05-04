import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../lib/utils';

interface PartnerDropdownProps {
  value: string;
  onChange: (value: string) => void;
  options: string[];
}

export const PartnerDropdown: React.FC<PartnerDropdownProps> = ({ value, onChange, options }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative w-full sm:w-48" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "w-full pl-5 pr-12 py-3.5 flex items-center justify-between bg-bg-secondary border rounded-full text-sm font-black transition-all cursor-pointer shadow-sm",
          isOpen 
            ? "border-telus-purple ring-2 ring-telus-purple/10 text-telus-purple" 
            : "border-border-primary text-telus-gray hover:border-telus-purple/30 hover:bg-bg-primary"
        )}
      >
        <span className="truncate">{value}</span>
        <ChevronDown className={cn("w-4 h-4 transition-transform duration-200", isOpen ? "rotate-180 text-telus-purple" : "text-text-secondary/50")} />
      </button>
      {isOpen && (
        <div className="absolute top-full left-0 mt-2 w-full bg-bg-secondary/95 backdrop-blur-md border border-border-primary rounded-2xl shadow-[0_20px_50px_rgba(75,40,109,0.15)] z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
          {options.map((option) => (
            <button
              key={option}
              onClick={() => {
                onChange(option);
                setIsOpen(false);
              }}
              className={cn(
                "w-full text-left px-5 py-3 text-sm font-bold transition-colors",
                value === option ? "text-telus-purple bg-telus-purple/10" : "text-telus-gray hover:bg-bg-primary hover:text-telus-purple"
              )}
            >
              {option}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
