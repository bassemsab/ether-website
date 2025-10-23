import { forwardRef } from 'react';
import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils/cn';
import { Slot } from '@radix-ui/react-slot';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'solid' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  asChild?: boolean;
};

const sizes = {
  sm: 'px-4 py-2 text-xs',
  md: 'px-6 py-3 text-sm',
  lg: 'px-7 py-4 text-base'
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'solid', size = 'md', asChild = false, children, ...props },
  ref
) {
  const Comp = asChild ? Slot : 'button';

  return (
    <Comp
      ref={ref}
      className={cn(
        'focus-ring inline-flex items-center justify-center rounded-full font-medium uppercase tracking-[0.2em] transition-all duration-300',
        variant === 'solid' &&
          'bg-brand text-white shadow-retro hover:-translate-y-0.5 hover:shadow-glow active:translate-y-0',
        variant === 'ghost' &&
          'border border-black/10 bg-surface/60 text-foreground backdrop-blur-md hover:border-black/20',
        sizes[size],
        'disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:shadow-none',
        className
      )}
      {...props}
    >
      {children}
    </Comp>
  );
});
