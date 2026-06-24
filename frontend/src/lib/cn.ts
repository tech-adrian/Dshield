import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge Tailwind class names with correct precedence. `clsx` resolves
 * conditional/array inputs and `twMerge` dedupes conflicting utilities so a
 * caller's override (e.g. `className`) always wins over a component default.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
