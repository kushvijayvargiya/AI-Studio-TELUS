import React from 'react';
import { cn } from '../../lib/utils';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'success';
  size?: 'sm' | 'md' | 'lg' | 'icon';
  isLoading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', isLoading, children, disabled, ...props }, ref) => {
    const variants = {
      primary: 'telus-button-primary',
      secondary: 'telus-button-secondary',
      outline: 'border border-border-primary bg-transparent hover:bg-bg-primary text-text-primary',
      ghost: 'bg-transparent hover:bg-bg-primary text-text-primary',
      danger: 'bg-red-600 text-white hover:bg-red-700 shadow-sm',
      success: 'bg-green-600 text-white hover:bg-green-700 shadow-sm',
    };

    const sizes = {
      sm: 'px-3 py-1.5 text-xs font-bold rounded-lg',
      md: 'px-4 py-2 text-sm font-bold rounded-xl',
      lg: 'px-6 py-3 text-base font-bold rounded-2xl',
      icon: 'p-2 rounded-lg',
    };

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={cn(
          'inline-flex items-center justify-center transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100',
          variants[variant],
          sizes[size],
          className
        )}
        {...props}
      >
        {isLoading && (
          <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
        )}
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';
