import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../lib/utils';

interface CustomSelectProps {
  value: string | number;
  onChange: (value: any) => void;
  options: { label: string; value: string | number }[];
  className?: string;
  buttonClassName?: string;
  icon?: React.ReactNode;
}

export const CustomSelect: React.FC<CustomSelectProps> = ({ value, onChange, options, className, buttonClassName, icon }) => {
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

  const selectedOption = options.find(opt => opt.value === value);

  return (
    <div className={cn("relative inline-block", className)} ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex items-center space-x-2 bg-telus-light border rounded-xl p-1.5 transition-all cursor-pointer w-full",
          isOpen ? "border-telus-purple ring-2 ring-[#4B286D1A] bg-white" : "border-[#4B286D1A] hover:border-[#4B286D4D]",
          buttonClassName
        )}
      >
        {icon && <div className="pl-1.5 pr-1 text-[#2A2C2E66]">{icon}</div>}
        <span className="text-sm font-bold text-telus-gray px-1.5">{selectedOption?.label || value}</span>
        <ChevronDown className={cn("w-4 h-4 text-[#2A2C2E66] transition-transform duration-200", isOpen && "rotate-180 text-telus-purple")} />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-2 min-w-[120px] bg-[#FFFFFFF2] backdrop-blur-md border border-[#4B286D1A] rounded-2xl shadow-[0_20px_50px_rgba(75,40,109,0.15)] z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
          <div className="max-h-60 overflow-y-auto py-2">
            {options.map((option) => (
              <button
                key={option.value}
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                }}
                className={cn(
                  "w-full text-left px-4 py-2 text-sm font-bold transition-colors",
                  value === option.value 
                    ? "text-telus-purple bg-[#4B286D0D]" 
                    : "text-telus-gray hover:bg-[#4B286D0D] hover:text-telus-purple"
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
