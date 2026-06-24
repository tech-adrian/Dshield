import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

const selectButton = cva(
  "focus-ring block rounded-xl border p-3 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50",
  {
    variants: {
      selected: {
        true: "",
        false: "border-zinc-700 text-zinc-400 hover:border-zinc-500",
      },
      tone: {
        white: "",
        accent: "",
      },
    },
    compoundVariants: [
      {
        selected: true,
        tone: "white",
        class: "border-white bg-zinc-800 text-white",
      },
      {
        selected: true,
        tone: "accent",
        class: "border-brand-500 bg-brand-950/30 text-brand-300",
      },
    ],
    defaultVariants: { selected: false, tone: "white" },
  },
);

export interface SelectButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "type">,
    VariantProps<typeof selectButton> {}

/**
 * A toggleable selection button used for denomination tiers, note pickers, and
 * mode switches. `selected` drives the active styling; `tone` chooses the
 * active accent (neutral white or brand).
 */
export function SelectButton({
  className,
  selected,
  tone,
  ...props
}: SelectButtonProps) {
  return (
    <button
      type="button"
      className={cn(selectButton({ selected, tone }), className)}
      {...props}
    />
  );
}
