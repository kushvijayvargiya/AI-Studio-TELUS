import React from 'react';
import { cn } from '../../lib/utils';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, icon, ...props }, ref) => {
    return (
      <div className="space-y-1.5 w-full">
        {label && (
          <label className="text-[10px] font-black text-text-secondary uppercase tracking-widest ml-1">
            {label}
          </label>
        )}
        <div className="relative group">
          {icon && (
            <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-secondary/50 group-focus-within:text-telus-purple transition-colors">
              {icon}
            </div>
          )}
          <input
            ref={ref}
            className={cn(
              'w-full telus-card-inner px-4 py-2.5 text-sm text-text-primary transition-all placeholder:text-text-secondary/30 focus:outline-none focus:ring-2 focus:ring-telus-purple/10 focus:border-telus-purple',
              icon && 'pl-10',
              error && 'border-red-500 focus:ring-red-500/10 focus:border-red-500',
              className
            )}
            {...props}
          />
        </div>
        {error && (
          <p className="text-[10px] font-bold text-red-500 ml-1 mt-1">
            {error}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
