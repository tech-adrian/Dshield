import { cn } from "@/lib/cn";

/** Indeterminate loading spinner. Inherits size via className (default h-4 w-4). */
export function Spinner({ className }: { className?: string }) {
  return (
    <div
      role="status"
      aria-label="Loading"
      className={cn(
        "h-4 w-4 animate-spin rounded-full border-2 border-zinc-400 border-t-white",
        className,
      )}
    />
  );
}
