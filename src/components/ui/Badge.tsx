import React from 'react';
import { cn } from '../../lib/utils';

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'primary' | 'secondary' | 'success' | 'warning' | 'danger' | 'outline' | 'info';
  size?: 'xs' | 'sm' | 'md' | 'lg';
}

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = 'default', size = 'sm', children, ...props }, ref) => {
    const variants = {
      default: 'telus-badge',
      primary: 'bg-[#4B286D1A] text-telus-purple border border-[#4B286D33]',
      secondary: 'bg-blue-50 text-blue-600 border border-blue-100',
      success: 'bg-green-50 text-green-600 border border-green-100',
      warning: 'bg-orange-50 text-orange-600 border border-orange-100',
      danger: 'bg-red-50 text-red-600 border border-red-100',
      outline: 'bg-transparent border border-[#4B286D33] text-[#2A2C2E99]',
      info: 'bg-blue-50 text-blue-700 border border-blue-200',
    };

    const sizes = {
      xs: 'px-1.5 py-0.5 text-[8px] font-black uppercase tracking-widest rounded-md',
      sm: 'px-2 py-0.5 text-[10px] font-bold rounded-full',
      md: 'px-3 py-1 text-xs font-bold rounded-full',
      lg: 'px-4 py-1.5 text-sm font-bold rounded-full',
    };

    return (
      <span
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center transition-colors',
          variants[variant],
          sizes[size],
          className
        )}
        {...props}
      >
        {children}
      </span>
    );
  }
);

Badge.displayName = 'Badge';
