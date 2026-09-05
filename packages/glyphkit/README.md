# glyphkit

Font outlines as SVG paths and React components. Stretch a letter, draw an outline, add layers, or clip content inside its shape.

The package ships TypeScript source. It is a workspace package in this repository; it has not been published to npm.

```tsx
import { Glyph, Word } from "glyphkit";
import font from "glyphkit/fonts/familjen-grotesk-700";

<Glyph char="B" font={font} size={240} stretch={{ x: 1.6 }} smooth />
<Word text="HELLO" font={font} size={120} tracking={-0.04} fill="#22221f" />
```

`size` is the cap height in pixels. `stretch.x` and `stretch.y` change the ink bounds; `1` leaves that axis at its original size.

## Stretching

`protectStems` defaults to `true`. It directs more of the stretch through the spaces between strokes. The default mode also applies local corrections to hold the stroke weight more closely, which can create notches at joins and shoulders.

Use `smooth` for display lettering. It skips those local corrections and uses a continuous axis map. Joins stay clean, with more weight variation on curves and diagonals. The playground uses this mode.

Set `protectStems={false}` for ordinary scaling. Strong compression eventually changes stroke weight in either mode. `minStretch(font, text)` estimates the condensation limit for the default protection mode.

## Paths without React

```ts
import { glyphGeometry } from "glyphkit";

const { d, bbox, contours } = glyphGeometry(font, "A", {
  stretch: { x: 1.5, y: 1.2 },
  smooth: true,
});
```

Coordinates use a normalized 1000-unit em, with y pointing down and the baseline at zero. `bbox` contains `[minX, minY, maxX, maxY]`.

## Appearance

`Glyph` and `Word` accept `fill`, `stroke`, `strokeWidth`, `halo`, and `depth`. Stroke widths, halos, and extrusion steps use em units. Children of `Glyph` are clipped inside its outline. `Word` accepts a `surface` callback for content spanning multiple letters.

## Fonts

Import a face by name and weight, for example `glyphkit/fonts/space-grotesk-400` or `glyphkit/fonts/bodoni-moda-700`. Each of the three included families has weights 400, 500, 600, and 700.

To extract another font:

```sh
pnpm --filter glyphkit extract --font /path/to/font.ttf --out fonts/my-font.json --name "My Font"
```

The extractor writes JSON and a typed TypeScript module. It flattens curves at build time, so rendering the outlines does not require the original font file. It does not instance variable-font axes; supply a static font instance for the desired weight.

The additional faces contain A–Z. Familjen Grotesk 700 also includes digits and several punctuation marks. Missing characters return empty geometry. Font sources and licenses are listed in [../../THIRD_PARTY_NOTICES.md](../../THIRD_PARTY_NOTICES.md).
