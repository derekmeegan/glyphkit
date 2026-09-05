/**
 * A face you extracted yourself.
 *
 * Any TrueType or OpenType file becomes a glyphkit face — a local path or a
 * URL — and the extractor writes a typed module beside the JSON:
 *
 *   cd packages/glyphkit
 *   node scripts/extract.mjs --font ~/fonts/YourFace-Bold.ttf \
 *     --name "Your Face Bold" --out fonts/your-face-bold.json
 *
 * Then `import yourFaceBold from "glyphkit/fonts/your-face-bold"` and pass it
 * anywhere a bundled face goes. Every face is the same shape, so a component
 * can take one as a prop and stay face-agnostic:
 */
import { Glyph, type GlyphFont } from "glyphkit";

export function Initial({ font, char }: { font: GlyphFont; char: string }) {
  return <Glyph char={char} font={font} size={200} stretch={{ x: 1.2 }} fill="#22221f" title={char} />;
}
