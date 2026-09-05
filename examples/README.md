# Examples

Small, self-contained pieces of glyphkit. Each file is a React component you
can paste into an app; they type-check with the rest of the repo, so they stay
correct as the library moves.

| File | What it shows |
| --- | --- |
| [`quickstart.tsx`](./quickstart.tsx) | One letter, drawn as a path. |
| [`stretched-letter.tsx`](./stretched-letter.tsx) | A letter exported from the playground's editor. |
| [`outlined-letter.tsx`](./outlined-letter.tsx) | Outline appearance, and stretching with stems left loose. |
| [`word.tsx`](./word.tsx) | A run of letters set tighter than they were drawn. |
| [`your-own-font.tsx`](./your-own-font.tsx) | A face you extracted yourself. |

## Quickstart

Install the library and a face. Faces ship as separate modules, so an app
downloads only the ones it sets:

```bash
npm install glyphkit
```

```tsx
import { Glyph } from "glyphkit";
import familjenGrotesk700 from "glyphkit/fonts/familjen-grotesk-700";

export function Hero() {
  return <Glyph char="G" font={familjenGrotesk700} size={240} fill="#22221f" />;
}
```

`size` is the cap height in px — the one number that sets how big the letter
is. The result is an `<svg>` with a single `<path>`: no web font to load, no
text run to fight with, and the shape is yours to fill, clip, or animate.

Three props do most of the work:

- **`stretch={{ x, y }}`** — how far to pull the letter from its drawn
  proportions. `1` is as-drawn.
- **`protectStems`** (on by default) — hold stroke weight while stretching, so
  a wide letter still looks like the type designer's weight rather than a
  smeared one. Turn it off to get the plain anisotropic scale.
- **`smooth`** — a continuous axis map, which keeps joins clean at display
  sizes.

## Bringing your own font

Any TrueType or OpenType file becomes a glyphkit face. Point the extractor at
a local file or a URL:

```bash
cd packages/glyphkit
node scripts/extract.mjs \
  --font ~/fonts/YourFace-Bold.ttf \
  --name "Your Face Bold" \
  --chars ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 \
  --out fonts/your-face-bold.json
```

It writes `fonts/your-face-bold.json` and a typed `fonts/your-face-bold.ts`
beside it, which is what you import. Outlines are flattened to polygons at
extraction time — the warp moves points, and moving a curve's control point
does not move the curve through it — then simplified back down, so the file
carries points where the curvature is.

Exports go the other way as **SVG paths, not font files**: the playground's
letter editor downloads an SVG or copies a `<Glyph>` component. Licensing
follows the face you extracted — check that a font's license allows
redistributing outlines before shipping them in an app.
