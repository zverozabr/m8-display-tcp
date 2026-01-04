#!/usr/bin/env npx tsx
/**
 * Convert M8 font from C header to TypeScript
 * Extracts BMP data and converts to base64 for browser use
 */

import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

interface FontInfo {
  name: string;
  width: number;
  height: number;
  glyphX: number;
  glyphY: number;
  screenOffsetY: number;
  textOffsetY: number;
  waveformMaxHeight: number;
  bmpBase64: string;
}

function extractFontFromHeader(headerPath: string): FontInfo | null {
  const content = readFileSync(headerPath, "utf-8");

  // Parse struct values (supports negative numbers)
  const structMatch = content.match(/struct inline_font \w+ = \{\s*(-?\d+),\s*(-?\d+),\s*(-?\d+),\s*(-?\d+),\s*(-?\d+),\s*(-?\d+),\s*(-?\d+),\s*(-?\d+),\s*(-?\d+),/);
  if (!structMatch) {
    console.error("Could not parse struct values");
    return null;
  }

  const [, width, height, glyphX, glyphY, , screenOffsetY, textOffsetY, waveformMaxHeight, imageSize] = structMatch.map(Number);

  // Extract hex bytes
  const hexMatch = content.match(/\{([^}]+)\}\}/s);
  if (!hexMatch) {
    console.error("Could not find image data");
    return null;
  }

  // Extract all 0x## hex values using regex (handles leading { correctly)
  const hexBytes = [...hexMatch[1].matchAll(/0x([0-9A-Fa-f]{2})/g)]
    .map(m => parseInt(m[1], 16));

  // Convert to Buffer and base64
  const buffer = Buffer.from(hexBytes);
  const bmpBase64 = buffer.toString("base64");

  // Get font name from filename
  const name = headerPath.match(/font(\d+)/)?.[1] ?? "unknown";

  return {
    name: `font_v${name}`,
    width,
    height,
    glyphX,
    glyphY,
    screenOffsetY,
    textOffsetY,
    waveformMaxHeight,
    bmpBase64,
  };
}

// Convert all fonts
const fontsDir = "/home/sham/work/m8/m8c-src/src/fonts";
const fonts: FontInfo[] = [];

for (let i = 1; i <= 5; i++) {
  const headerPath = join(fontsDir, `font${i}.h`);
  try {
    const font = extractFontFromHeader(headerPath);
    if (font) {
      fonts.push(font);
      console.log(`Converted ${font.name}: ${font.width}x${font.height}, glyph ${font.glyphX}x${font.glyphY}`);
    }
  } catch (err) {
    console.error(`Failed to convert font${i}:`, err);
  }
}

// Generate TypeScript module
const tsOutput = `/**
 * M8 Fonts - Auto-generated from m8c source
 * DO NOT EDIT - run scripts/convert-font.ts to regenerate
 */

export interface M8Font {
  name: string;
  width: number;
  height: number;
  glyphX: number;
  glyphY: number;
  screenOffsetY: number;
  textOffsetY: number;
  waveformMaxHeight: number;
  bmpBase64: string;
}

export const M8_FONTS: M8Font[] = ${JSON.stringify(fonts, null, 2)};

// Font indices matching m8c
export const FONT_V1_SMALL = 0;
export const FONT_V1_LARGE = 1;
export const FONT_V2_SMALL = 2;
export const FONT_V2_LARGE = 3;
export const FONT_V2_HUGE = 4;

/**
 * Get font by index
 */
export function getFont(index: number): M8Font | null {
  return M8_FONTS[index] ?? null;
}

/**
 * Load font image from base64
 */
export function loadFontImage(font: M8Font): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = \`data:image/bmp;base64,\${font.bmpBase64}\`;
  });
}
`;

const outputPath = join("/home/sham/work/m8-display/src/display", "m8-fonts.ts");
writeFileSync(outputPath, tsOutput);
console.log(`\nGenerated: ${outputPath}`);
