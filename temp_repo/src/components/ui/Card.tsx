import React from 'react';
import { cn } from '../../lib/utils';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'flat' | 'outline' | 'glass';
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant = 'default', padding = 'md', children, ...props }, ref) => {
    const variants = {
      default: 'telus-card',
      flat: 'bg-bg-secondary rounded-2xl border border-border-primary',
      outline: 'bg-transparent rounded-2xl border border-border-primary',
      glass: 'bg-bg-primary/80 backdrop-blur-md rounded-2xl border border-border-primary shadow-xl',
    };

    const paddings = {
      none: 'p-0',
      sm: 'p-3',
      md: 'p-4',
      lg: 'p-6',
    };

    return (
      <div
        ref={ref}
        className={cn(
          'transition-all duration-300',
          variants[variant],
          paddings[padding],
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Card.displayName = 'Card';
