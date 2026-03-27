/**
 * Sample Figma-compatible plugin: Color Grid Generator
 * 
 * This plugin demonstrates the Figma Plugin API compatibility layer.
 * The same code would work in Figma's plugin environment.
 */

export const FIGMA_COLOR_GRID_CODE = `
// Color Grid Generator — works in both Figma and OpenSketch
const COLORS = [
  { r: 0.95, g: 0.26, b: 0.21 },  // Red
  { r: 0.91, g: 0.12, b: 0.39 },  // Pink
  { r: 0.61, g: 0.15, b: 0.69 },  // Purple
  { r: 0.40, g: 0.23, b: 0.72 },  // Deep Purple
  { r: 0.25, g: 0.32, b: 0.71 },  // Indigo
  { r: 0.13, g: 0.59, b: 0.95 },  // Blue
  { r: 0.01, g: 0.66, b: 0.96 },  // Light Blue
  { r: 0.00, g: 0.74, b: 0.83 },  // Cyan
  { r: 0.00, g: 0.59, b: 0.53 },  // Teal
  { r: 0.30, g: 0.69, b: 0.31 },  // Green
  { r: 0.55, g: 0.76, b: 0.29 },  // Light Green
  { r: 0.80, g: 0.86, b: 0.22 },  // Lime
  { r: 1.00, g: 0.92, b: 0.23 },  // Yellow
  { r: 1.00, g: 0.76, b: 0.03 },  // Amber
  { r: 1.00, g: 0.60, b: 0.00 },  // Orange
  { r: 1.00, g: 0.34, b: 0.13 },  // Deep Orange
];

const COLS = 4;
const SIZE = 60;
const GAP = 8;
const startX = 100;
const startY = 100;

for (let i = 0; i < COLORS.length; i++) {
  const col = i % COLS;
  const row = Math.floor(i / COLS);
  const rect = figma.createRectangle();
  rect.x = startX + col * (SIZE + GAP);
  rect.y = startY + row * (SIZE + GAP);
  rect.resize(SIZE, SIZE);
  rect.cornerRadius = 8;
  rect.fills = [{ type: "SOLID", color: COLORS[i] }];
  rect.name = "Color " + (i + 1);
}

figma.notify("Created " + COLORS.length + " color swatches!");
`;
