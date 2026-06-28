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
    </div>
  );
}
