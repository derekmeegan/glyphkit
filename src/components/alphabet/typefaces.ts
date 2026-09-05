import type { GlyphFont } from "glyphkit";

import { LETTERS } from "./composition";

export const FAMILIES = ["Familjen Grotesk", "Space Grotesk", "Bodoni Moda"] as const;
export const WEIGHTS = [400, 500, 600, 700] as const;
export type Family = typeof FAMILIES[number];
export type Weight = typeof WEIGHTS[number];
/** A bundled face, or one the reader imported — imported faces are one weight. */
export type FontChoice = { family: string; weight: Weight };

// Each outline set is a separate chunk; only the chosen face is downloaded.
const LOADERS: Record<Family, Record<Weight, () => Promise<{ default: GlyphFont }>>> = {
  "Familjen Grotesk": {
    400: () => import("glyphkit/fonts/familjen-grotesk-400"),
    500: () => import("glyphkit/fonts/familjen-grotesk-500"),
    600: () => import("glyphkit/fonts/familjen-grotesk-600"),
    700: () => import("glyphkit/fonts/familjen-grotesk-700"),
  },
  "Space Grotesk": {
    400: () => import("glyphkit/fonts/space-grotesk-400"),
    500: () => import("glyphkit/fonts/space-grotesk-500"),
    600: () => import("glyphkit/fonts/space-grotesk-600"),
    700: () => import("glyphkit/fonts/space-grotesk-700"),
  },
  "Bodoni Moda": {
    400: () => import("glyphkit/fonts/bodoni-moda-400"),
    500: () => import("glyphkit/fonts/bodoni-moda-500"),
    600: () => import("glyphkit/fonts/bodoni-moda-600"),
    700: () => import("glyphkit/fonts/bodoni-moda-700"),
  },
};

export const isBundledFamily = (family: string): family is Family =>
  (FAMILIES as readonly string[]).includes(family);

export async function loadTypeface(choice: FontChoice): Promise<GlyphFont> {
  if (!isBundledFamily(choice.family)) throw new Error(`${choice.family} is not a bundled face`);
  return (await LOADERS[choice.family][choice.weight]()).default;
}

const slugify = (name: string) => name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const camelize = (slug: string) => {
  const ident = slug.replace(/-(.)/g, (_, c: string) => c.toUpperCase()).replace(/^[^a-zA-Z]+/, "");
  return ident ? ident[0].toLowerCase() + ident.slice(1) : "yourFont";
};

/** Where a face lives, and what to call it when the code export imports it. */
export function fontModule(choice: FontChoice) {
  if (isBundledFamily(choice.family)) {
    const slug = `${slugify(choice.family)}-${choice.weight}`;
    return { path: `glyphkit/fonts/${slug}`, binding: camelize(slug), imported: false };
  }
  // An imported face exists only in this page. The code that uses it needs the
  // same face extracted to a module, which is what the note in the export says.
  const slug = slugify(choice.family) || "your-font";
  return { path: `glyphkit/fonts/${slug}`, binding: camelize(slug), imported: true, slug };
}

/** Refused imports the reader can do something about; anything else is a bug. */
export class FontImportError extends Error {}

/** 8 MB covers any text face; a CJK file would lock the tab up for seconds. */
export const MAX_FONT_BYTES = 8 * 1024 * 1024;

/**
 * Read a font file the reader picked, in their browser.
 *
 * The same extraction the build step runs, so an imported face behaves like a
 * bundled one — same warp, same stem protection. The file is never uploaded.
 */
export async function importTypeface(file: File, taken: readonly string[] = []): Promise<{ name: string; font: GlyphFont }> {
  if (file.size > MAX_FONT_BYTES) throw new FontImportError("That file is over 8 MB. Try a single weight.");

  // opentype.js is a quarter of a megabyte, so it arrives only if someone imports.
  const { extractFont } = await import("glyphkit/extract");
  let extracted;
  try {
    extracted = extractFont(await file.arrayBuffer(), { chars: LETTERS.join("") });
  } catch {
    throw new FontImportError("Couldn’t read that font. TrueType, OpenType and WOFF work; WOFF2 doesn’t.");
  }

  // The alphabet sets all 26 capitals, so a face missing any of them can't fill it.
  if (extracted.missing.length) {
    throw new FontImportError(`That font has no ${extracted.missing.slice(0, 6).join(", ")}.`);
  }

  const base = extracted.font.name.trim() || file.name.replace(/\.[^.]+$/, "");
  let name = base;
  for (let n = 2; taken.includes(name); n++) name = `${base} (${n})`;
  return { name, font: { ...extracted.font, name } };
}
