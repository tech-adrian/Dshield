import { ShieldIcon } from "./icons";

/**
 * Live ambient backdrop. A few large, heavily-blurred color blobs drift slowly
 * behind every page — an "aurora" that keeps the surface feeling alive without
 * being loud. Low opacity + slow, small-amplitude motion (and it freezes under
 * prefers-reduced-motion via the global rule in globals.css).
 *
 * Rendered once in the root layout as a fixed layer behind all content. The
 * faint grid (body::before) sits just above this; page content sits above both.
 */
export function Background() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-20 overflow-hidden"
    >
      {/* Indigo — anchored behind the hero, breathes vertically. */}
      <div className="absolute -top-48 left-1/2 h-[42rem] w-[42rem] -translate-x-1/2 animate-[drift-a_26s_ease-in-out_infinite] rounded-full bg-brand-500/15 blur-[130px]" />
      {/* Cyan — upper right, slow diagonal drift. */}
      <div className="absolute top-[18%] -right-40 h-[34rem] w-[34rem] animate-[drift-b_32s_ease-in-out_infinite] rounded-full bg-cyan-500/10 blur-[130px]" />
      {/* Violet — lower left, counter drift to keep the field balanced. */}
      <div className="absolute -bottom-40 -left-40 h-[36rem] w-[36rem] animate-[drift-c_38s_ease-in-out_infinite] rounded-full bg-violet-600/10 blur-[130px]" />

      {/* Shield mark, rendered huge and faint on the right edge as the source
          of its own light — the glow blob behind it doubles as illumination,
          and a directional drop-shadow (not the blur-only kind above) casts
          its shadow further right, so it reads as a lit object, not a decal.
          Anchored off-canvas and static; only its light breathes. */}
      <div className="absolute top-1/3 -right-64 h-[46rem] w-[46rem] -translate-y-1/2 animate-[drift-b_42s_ease-in-out_infinite] rounded-full bg-brand-400/15 blur-[170px]" />
      <ShieldIcon
        strokeWidth={0.35}
        className="absolute top-1/3 -right-48 h-[38rem] w-[38rem] -translate-y-1/2 text-brand-300/[0.07] drop-shadow-[1.5rem_1.25rem_1.75rem_rgba(99,102,241,0.25)]"
      />
    </div>
  );
}
