import type { GlyphFont } from "glyphkit";

export const FAMILIES = ["Familjen Grotesk", "Space Grotesk", "Bodoni Moda"] as const;
export const WEIGHTS = [400, 500, 600, 700] as const;
export type Family = typeof FAMILIES[number];
export type Weight = typeof WEIGHTS[number];
export type FontChoice = { family: Family; weight: Weight };

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

export async function loadTypeface(choice: FontChoice): Promise<GlyphFont> {
  return (await LOADERS[choice.family][choice.weight]()).default;
}

/** Where a face lives, and what to call it when the code export imports it. */
export function fontModule(choice: FontChoice) {
  const slug = `${choice.family.toLowerCase().replace(/\s+/g, "-")}-${choice.weight}`;
  const binding = choice.family.replace(/\s+/g, "") + choice.weight;
  return { path: `glyphkit/fonts/${slug}`, binding: binding[0].toLowerCase() + binding.slice(1) };
}
