import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef } from "react";
import { cn } from "@/lib/cn";

export const buttonVariants = cva(
  "focus-ring inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50",
  {
    variants: {
      variant: {
        // High-emphasis call to action.
        primary: "bg-white text-black hover:bg-zinc-200",
        // Brand-accented action (e.g. threshold disclosure).
        accent: "bg-brand-600 text-white hover:bg-brand-500",
        // Bordered, lower emphasis.
        outline:
          "border border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white",
        // Quiet, text-only.
        ghost: "text-zinc-400 hover:bg-zinc-800/60 hover:text-white",
      },
      size: {
        sm: "px-3 py-1.5 text-xs",
        md: "px-4 py-2 text-sm",
        lg: "px-8 py-3 text-sm",
      },
      fullWidth: {
        true: "w-full",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button({ className, variant, size, fullWidth, ...props }, ref) {
    return (
      <button
        ref={ref}
        className={cn(buttonVariants({ variant, size, fullWidth }), className)}
        {...props}
      />
    );
  },
);
