export const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
export const INK = "#22221f";
export const PAPER = "#f4f3ee";
export const MIN_SCALE = 0.4;
export const MAX_SCALE = 3;

export type LetterSettings = { x: number; y: number; color: string; outline: boolean; protect: boolean };
export type Composition = Record<string, LetterSettings>;
export type LetterBox = { char: string; x: number; y: number; width: number; height: number };
export type Layout = {
  boxes: LetterBox[];
  rows: string[][];
  rowWeights: number[];
  availableHeight: number;
  availableWidths: number[];
  baseSize: number;
};
export const defaults = (): LetterSettings => ({ x: 1, y: 1, color: INK, outline: false, protect: true });
export const initialComposition = (): Composition => Object.fromEntries(LETTERS.map((char) => [char, defaults()]));
export const clampScale = (value: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));

/** All spacing belongs to the composition, so the poster and SVG export agree. */
export function layoutComposition(width: number, height: number, composition: Composition, ratios: Record<string, number>): Layout {
  const rows = (width / height < 1.1
    ? ["ABCDE", "FGHI", "JKLM", "NOPQ", "RSTU", "VWXYZ"]
    : ["ABCDEF", "GHIJKLM", "NOPQRST", "UVWXYZ"]
  ).map((row) => row.split(""));
  const gap = width < 600 ? 7 : 12;
  const availableHeight = Math.max(1, height - gap * (rows.length - 1));
  const availableWidths = rows.map((row) => Math.max(1, width - gap * (row.length - 1)));
  const rowWeights = rows.map((row) => Math.max(...row.map((char) => composition[char].y)));
  const totalHeight = rowWeights.reduce((sum, weight) => sum + weight, 0);
  const boxes: LetterBox[] = [];
  let top = 0;
  rows.forEach((row, index) => {
    const rowHeight = availableHeight * rowWeights[index] / totalHeight;
    const totalWidth = row.reduce((sum, char) => sum + ratios[char] * composition[char].x, 0);
    let left = 0;
    row.forEach((char) => {
      const width = availableWidths[index] * ratios[char] * composition[char].x / totalWidth;
      const height = availableHeight * composition[char].y / totalHeight;
      boxes.push({ char, x: left, y: top + rowHeight - height, width, height });
      left += width + gap;
    });
    top += rowHeight + gap;
  });
  return { boxes, rows, rowWeights, availableHeight, availableWidths, baseSize: availableHeight / rows.length };
}

/** Invert the layout so dragged edges change the requested size in pixels. */
export function resizeLetter(char: string, width: number | undefined, height: number | undefined, layout: Layout, composition: Composition, ratios: Record<string, number>): Pick<LetterSettings, "x" | "y"> {
  const rowIndex = layout.rows.findIndex((row) => row.includes(char));
  const peers = layout.rows[rowIndex].filter((letter) => letter !== char);
  let { x, y } = composition[char];
  if (width !== undefined) {
    const available = layout.availableWidths[rowIndex];
    const target = Math.max(1, Math.min(available - 1, width));
    const others = peers.reduce((sum, letter) => sum + ratios[letter] * composition[letter].x, 0);
    x = clampScale(target * others / ((available - target) * ratios[char]));
  }
  if (height !== undefined) {
    const available = layout.availableHeight;
    const target = Math.max(1, Math.min(available - 1, height));
    const others = layout.rowWeights.reduce((sum, weight, index) => sum + (index === rowIndex ? 0 : weight), 0);
    const peerHeight = Math.max(...peers.map((letter) => composition[letter].y));
    const threshold = available * peerHeight / (others + peerHeight);
    y = clampScale(target <= threshold ? target * (others + peerHeight) / available : target * others / (available - target));
  }
  return { x, y };
}
