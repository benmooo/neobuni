/**
 * Shared visual language for the study surfaces.
 *
 * The app kit is compact (13-14px body, sharp corners, ring-based cards) and
 * uses Oxanium for headings, so the study UI reuses those tokens instead of
 * inventing its own scale.
 */

/** Small all-caps label that opens a section. */
export const EYEBROW =
  "font-medium text-[0.625rem] uppercase tracking-[0.16em] text-muted-foreground";

/** Sharp chip for concepts and tags (no pills: `--radius` is 0). */
export const TAG =
  "inline-flex items-center border border-border px-1.5 py-0.5 text-[0.625rem] text-muted-foreground";

/** Reading copy. */
export const PROSE = "text-sm leading-7";

/** Small numeric/text meta. */
export const META =
  "font-heading text-[0.6875rem] text-muted-foreground tabular-nums";

/** Separator dot between inline meta items. */
export const DOT = "text-muted-foreground/50";
