/**
 * Framebuffer tests - TDD for M8 display rendering
 */

import { describe, it, expect } from "bun:test";
import { Framebuffer, SCREEN_WIDTH, SCREEN_HEIGHT } from "../../src/display/framebuffer";

describe("Framebuffer", () => {
  describe("constructor", () => {
    it("should create 320x240 black screen", () => {
      const fb = new Framebuffer();
      const pixel = fb.getPixel(0, 0);
      expect(pixel).toEqual({ r: 0, g: 0, b: 0 });
    });
  });

  describe("setPixel / getPixel", () => {
    it("should set and get pixel color", () => {
      const fb = new Framebuffer();
      fb["setPixel"](10, 20, { r: 255, g: 128, b: 64 });
      expect(fb.getPixel(10, 20)).toEqual({ r: 255, g: 128, b: 64 });
    });

    it("should return black for out of bounds", () => {
      const fb = new Framebuffer();
      const black = { r: 0, g: 0, b: 0 };
      expect(fb.getPixel(-1, 0)).toEqual(black);
      expect(fb.getPixel(320, 0)).toEqual(black);
      expect(fb.getPixel(0, 240)).toEqual(black);
    });
  });

  describe("applyRect", () => {
    it("should draw filled rectangle", () => {
      const fb = new Framebuffer();
      fb.applyRect({ x: 10, y: 20, width: 5, height: 3, color: { r: 255, g: 0, b: 0 } });

      // All pixels in rect should be red
      for (let y = 20; y < 23; y++) {
        for (let x = 10; x < 15; x++) {
          expect(fb.getPixel(x, y)).toEqual({ r: 255, g: 0, b: 0 });
        }
      }
      // Pixel outside rect should be black
      expect(fb.getPixel(9, 20)).toEqual({ r: 0, g: 0, b: 0 });
    });

    it("should handle rectangles at screen edges", () => {
      const fb = new Framebuffer();
      // Bottom-right corner
      fb.applyRect({ x: 318, y: 238, width: 10, height: 10, color: { r: 100, g: 100, b: 100 } });
      expect(fb.getPixel(319, 239)).toEqual({ r: 100, g: 100, b: 100 });
    });
  });

  describe("applyWave", () => {
    it("should draw waveform in top-right corner using sample as Y coordinate", () => {
      const fb = new Framebuffer();
      const waveData = new Uint8Array([10, 15, 20, 15, 10]); // Y coordinates, not heights!
      fb.applyWave({ color: { r: 50, g: 236, b: 255 }, data: waveData });

      // Waveform at x=315-319, y=sample value
      expect(fb.getPixel(315, 10)).toEqual({ r: 50, g: 236, b: 255 });
      expect(fb.getPixel(316, 15)).toEqual({ r: 50, g: 236, b: 255 });
      expect(fb.getPixel(317, 20)).toEqual({ r: 50, g: 236, b: 255 });
      expect(fb.getPixel(318, 15)).toEqual({ r: 50, g: 236, b: 255 });
      expect(fb.getPixel(319, 10)).toEqual({ r: 50, g: 236, b: 255 });
    });

    it("should clamp sample to waveMaxHeight=24", () => {
      const fb = new Framebuffer();
      fb.applyWave({ color: { r: 50, g: 236, b: 255 }, data: new Uint8Array([30, 50, 255]) });
      // All should be clamped to y=24
      expect(fb.getPixel(317, 24)).toEqual({ r: 50, g: 236, b: 255 });
      expect(fb.getPixel(318, 24)).toEqual({ r: 50, g: 236, b: 255 });
      expect(fb.getPixel(319, 24)).toEqual({ r: 50, g: 236, b: 255 });
    });

    it("should clear previous waveform area before drawing new one", () => {
      const fb = new Framebuffer();
      // Draw first waveform
      fb.applyWave({ color: { r: 255, g: 0, b: 0 }, data: new Uint8Array([5, 5, 5]) });
      expect(fb.getPixel(317, 5)).toEqual({ r: 255, g: 0, b: 0 });

      // Draw second waveform at different position
      fb.applyWave({ color: { r: 0, g: 255, b: 0 }, data: new Uint8Array([15, 15, 15]) });
      // Old position should be cleared (black)
      expect(fb.getPixel(317, 5)).toEqual({ r: 0, g: 0, b: 0 });
      // New position should have new color
      expect(fb.getPixel(317, 15)).toEqual({ r: 0, g: 255, b: 0 });
    });
  });

  describe("applyText", () => {
    it("should draw character at position with 5x7 font", () => {
      const fb = new Framebuffer();
      fb.applyText({
        x: 0,
        y: 0,
        char: "A",
        fg: { r: 50, g: 236, b: 255 },
        bg: { r: 0, g: 0, b: 0 },
      });
      // Character 'A' with 5x7 font + TEXT_OFFSET_Y=3 should have cyan pixels
      // Scan area 0-5 x 3-10 (font starts at y+3)
      let hasColor = false;
      for (let y = 3; y < 10; y++) {
        for (let x = 0; x < 5; x++) {
          const p = fb.getPixel(x, y);
          if (p && (p.r === 50 && p.g === 236 && p.b === 255)) {
            hasColor = true;
          }
        }
      }
      expect(hasColor).toBe(true);
    });
  });

  describe("keyboard rendering (RECT at bottom)", () => {
    it("should render rectangles in keyboard area (y > 200)", () => {
      const fb = new Framebuffer();
      // Keyboard keys are RECT at y > 200
      fb.applyRect({ x: 10, y: 210, width: 8, height: 20, color: { r: 100, g: 100, b: 100 } });
      expect(fb.getPixel(10, 210)).toEqual({ r: 100, g: 100, b: 100 });
      expect(fb.getPixel(17, 229)).toEqual({ r: 100, g: 100, b: 100 });
    });
  });

  describe("P0: White color (248,248,248) rendering", () => {
    it("should render white foreground color for text", () => {
      const fb = new Framebuffer();
      const white = { r: 248, g: 248, b: 248 };
      const gray = { r: 96, g: 96, b: 136 };

      fb.applyText({
        x: 0,
        y: 0,
        char: "0",
        fg: white,  // White foreground (selection)
        bg: gray,   // Gray background
      });

      // Should have white pixels where glyph is set (5x7 font + offset 3)
      let hasWhite = false;
      for (let y = 3; y < 10; y++) {
        for (let x = 0; x < 5; x++) {
          const p = fb.getPixel(x, y);
          if (p && p.r === 248 && p.g === 248 && p.b === 248) {
            hasWhite = true;
          }
        }
      }
      expect(hasWhite).toBe(true);
    });

    it("should render gray background for selection", () => {
      const fb = new Framebuffer();
      const white = { r: 248, g: 248, b: 248 };
      const gray = { r: 96, g: 96, b: 136 };

      fb.applyText({
        x: 0,
        y: 0,
        char: " ",  // Space - all background
        fg: white,
        bg: gray,
      });

      // Pixels in background area should be gray (y=3-9 for 5x7 font)
      const p = fb.getPixel(2, 5);
      expect(p).toEqual(gray);
    });
  });

  describe("P0: Small RECT for corner brackets", () => {
    it("should render 1x3 vertical line (corner bracket)", () => {
      const fb = new Framebuffer();
      const cyan = { r: 48, g: 236, b: 248 };

      // Corner bracket top-left: vertical line
      fb.applyRect({ x: 10, y: 20, width: 1, height: 3, color: cyan });

      expect(fb.getPixel(10, 20)).toEqual(cyan);
      expect(fb.getPixel(10, 21)).toEqual(cyan);
      expect(fb.getPixel(10, 22)).toEqual(cyan);
      // Adjacent pixel should be black
      expect(fb.getPixel(11, 20)).toEqual({ r: 0, g: 0, b: 0 });
    });

    it("should render 3x1 horizontal line (corner bracket)", () => {
      const fb = new Framebuffer();
      const cyan = { r: 48, g: 236, b: 248 };

      // Corner bracket top-left: horizontal line
      fb.applyRect({ x: 10, y: 20, width: 3, height: 1, color: cyan });

      expect(fb.getPixel(10, 20)).toEqual(cyan);
      expect(fb.getPixel(11, 20)).toEqual(cyan);
      expect(fb.getPixel(12, 20)).toEqual(cyan);
      // Adjacent pixel should be black
      expect(fb.getPixel(10, 21)).toEqual({ r: 0, g: 0, b: 0 });
    });
  });

  describe("P1: Waveform full width", () => {
    it("should draw waveform across full screen width (320px)", () => {
      const fb = new Framebuffer();
      // Create 320 samples to fill full width
      const waveData = new Uint8Array(320);
      for (let i = 0; i < 320; i++) {
        waveData[i] = 12; // Middle Y position
      }

      fb.applyWave({ color: { r: 50, g: 236, b: 255 }, data: waveData });

      // Check leftmost and rightmost pixels
      expect(fb.getPixel(0, 12)).toEqual({ r: 50, g: 236, b: 255 });
      expect(fb.getPixel(319, 12)).toEqual({ r: 50, g: 236, b: 255 });
    });
  });
});
