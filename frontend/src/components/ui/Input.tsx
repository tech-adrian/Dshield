import { forwardRef, useId } from "react";
import { cn } from "@/lib/cn";

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  /** Helper text rendered under the field. Accepts rich content. */
  hint?: React.ReactNode;
  /** Render value in a monospace font (addresses, hashes, amounts). */
  mono?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, label, hint, mono, id, ...props },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;

  return (
    <div>
      {label && (
        <label
          htmlFor={inputId}
          className="mb-1.5 block text-xs text-zinc-500"
        >
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={inputId}
        className={cn(
          "focus-ring w-full rounded-xl border border-zinc-700 bg-zinc-800/80 p-3 text-sm text-zinc-200 placeholder-zinc-600 transition-colors focus-visible:border-zinc-500",
          mono && "font-mono text-xs",
          className,
        )}
        {...props}
      />
      {hint && <p className="mt-1.5 text-xs text-zinc-600">{hint}</p>}
    </div>
  );
});
