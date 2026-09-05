import { glyphGeometry, type GlyphFont } from "glyphkit";
import type { LetterBox, LetterSettings } from "./composition";
import { fontModule, type FontChoice } from "./typefaces";

/** How far the letter is pulled from its drawn proportions to fill its box. */
function stretchFor(font: GlyphFont, box: LetterBox, baseSize: number) {
  const data = font.glyphs[box.char];
  const scale = baseSize / font.capHeight;
  return {
    x: box.width / ((data.bbox[2] - data.bbox[0]) * scale),
    y: box.height / ((data.bbox[3] - data.bbox[1]) * scale),
  };
}

export function geometryFor(font: GlyphFont, box: LetterBox, baseSize: number, settings: LetterSettings) {
  return glyphGeometry(font, box.char, {
    stretch: stretchFor(font, box, baseSize),
    protectStems: settings.protect,
    smooth: true,
  });
}


export function letterSvg(font: GlyphFont, box: LetterBox, baseSize: number, settings: LetterSettings) {
  const geometry = geometryFor(font, box, baseSize, settings);
  const [x0, y0, x1, y1] = geometry.bbox;
  const padding = 2;
  const width = box.width + padding * 2;
  const height = box.height + padding * 2;
  const transform = `translate(${padding} ${padding}) scale(${box.width / (x1 - x0)} ${box.height / (y1 - y0)}) translate(${-x0} ${-y0})`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><title>${box.char}</title><g transform="${transform}"><path d="${geometry.d}" fill="${settings.outline ? "none" : settings.color}" stroke="${settings.outline ? settings.color : "none"}" stroke-width="1.5" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></g></svg>`;
}

const round = (value: number, places: number) => Number(value.toFixed(places));

/**
 * The same letter as a component someone can paste into their own app.
 *
 * `<Glyph>` takes the cap height in px and warps the outline itself, so the
 * export carries the stretch the letter was dragged to rather than a transform.
 */
export function letterReactCode(font: GlyphFont, box: LetterBox, baseSize: number, settings: LetterSettings, choice: FontChoice) {
  const stretch = stretchFor(font, box, baseSize);
  const size = Math.round(baseSize);
  const { path, binding } = fontModule(choice);
  // Glyph measures its outline stroke in em units; the canvas draws a 1.5px hairline.
  const strokeWidth = round(1.5 * font.capHeight / (font.em * size), 4);
  const ink = settings.outline
    ? [`fill="none"`, `stroke="${settings.color}"`, `strokeWidth={${strokeWidth}}`]
    : [`fill="${settings.color}"`];
  const props = [
    `char="${box.char}"`,
    `font={${binding}}`,
    `size={${size}}`,
    `stretch={{ x: ${round(stretch.x, 3)}, y: ${round(stretch.y, 3)} }}`,
    settings.protect ? "protectStems" : "protectStems={false}",
    "smooth",
    ...ink,
  ];
  return `import { Glyph } from "glyphkit";
import ${binding} from "${path}";

export function Letter${box.char}() {
  return (
    <Glyph
${props.map((prop) => `      ${prop}`).join("\n")}
    />
  );
}
`;
}
