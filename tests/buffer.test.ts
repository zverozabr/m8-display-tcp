/**
 * Text Buffer Tests
 * TDD: Tests first
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { TextBuffer, COLS, ROWS } from "../src/display/buffer";
import type { TextCommand, RectCommand } from "../src/state/types";

describe("TextBuffer", () => {
  let buffer: TextBuffer;

  beforeEach(() => {
    buffer = new TextBuffer();
  });

  describe("dimensions", () => {
    it("should have correct dimensions", () => {
      expect(TextBuffer.dimensions.cols).toBe(40);
      expect(TextBuffer.dimensions.rows).toBe(24);
    });
  });

  describe("applyText", () => {
    it("should place character at correct position", () => {
      const cmd: TextCommand = {
        type: "text",
        char: "A",
        charCode: 65,
        x: 16, // col 2 (16/8)
        y: 20, // row 2 (20/10)
        fg: { r: 255, g: 255, b: 255 },
        bg: { r: 0, g: 0, b: 0 },
      };

      buffer.applyText(cmd);

      const cell = buffer.getCell(2, 2);
      expect(cell).not.toBeNull();
      expect(cell!.char).toBe("A");
      expect(cell!.fg).toEqual({ r: 255, g: 255, b: 255 });
    });

    it("should detect cursor by highlight color", () => {
      const cmd: TextCommand = {
        type: "text",
        char: "X",
        charCode: 88,
        x: 80, // col 10
        y: 50, // row 5
        fg: { r: 255, g: 255, b: 0 }, // highlight yellow
        bg: { r: 0, g: 0, b: 0 },
      };

      buffer.applyText(cmd);

      const cursor = buffer.getCursor();
      expect(cursor.row).toBe(5);
      expect(cursor.col).toBe(10);
    });

    it("should ignore out of bounds characters", () => {
      const cmd: TextCommand = {
        type: "text",
        char: "X",
        charCode: 88,
        x: 400, // out of bounds
        y: 300,
        fg: { r: 255, g: 255, b: 255 },
        bg: { r: 0, g: 0, b: 0 },
      };

      // Should not throw
      buffer.applyText(cmd);
      expect(buffer.getCell(0, 0)!.char).toBe(" ");
    });
  });

  describe("applyRect", () => {
    it("should clear buffer on full screen rect", () => {
      // First add a character
      buffer.applyText({
        type: "text",
        char: "A",
        charCode: 65,
        x: 0,
        y: 0,
        fg: { r: 255, g: 255, b: 255 },
        bg: { r: 0, g: 0, b: 0 },
      });

      expect(buffer.getCell(0, 0)!.char).toBe("A");

      // Full screen clear
      const rect: RectCommand = {
        type: "rect",
        x: 0,
        y: 0,
        width: 320,
        height: 240,
        color: { r: 0, g: 0, b: 0 },
      };

      buffer.applyRect(rect);

      expect(buffer.getCell(0, 0)!.char).toBe(" ");
    });
  });

  describe("toText", () => {
    it("should render buffer as text", () => {
      // Add "HI" at row 0
      buffer.applyText({
        type: "text",
        char: "H",
        charCode: 72,
        x: 0,
        y: 0,
        fg: { r: 255, g: 255, b: 255 },
        bg: { r: 0, g: 0, b: 0 },
      });
      buffer.applyText({
        type: "text",
        char: "I",
        charCode: 73,
        x: 8,
        y: 0,
        fg: { r: 255, g: 255, b: 255 },
        bg: { r: 0, g: 0, b: 0 },
      });

      const text = buffer.toText();
      expect(text.startsWith("HI")).toBe(true);
    });

    it("should trim trailing whitespace", () => {
      buffer.applyText({
        type: "text",
        char: "X",
        charCode: 88,
        x: 0,
        y: 0,
        fg: { r: 255, g: 255, b: 255 },
        bg: { r: 0, g: 0, b: 0 },
      });

      const text = buffer.toText();
      expect(text).toBe("X");
    });
  });

  describe("getHeader", () => {
    it("should return first row", () => {
      buffer.applyText({
        type: "text",
        char: "P",
        charCode: 80,
        x: 0,
        y: 0,
        fg: { r: 255, g: 255, b: 255 },
        bg: { r: 0, g: 0, b: 0 },
      });
      buffer.applyText({
        type: "text",
        char: "H",
        charCode: 72,
        x: 8,
        y: 0,
        fg: { r: 255, g: 255, b: 255 },
        bg: { r: 0, g: 0, b: 0 },
      });

      expect(buffer.getHeader()).toBe("PH");
    });
  });

  describe("clear", () => {
    it("should reset all cells", () => {
      buffer.applyText({
        type: "text",
        char: "X",
        charCode: 88,
        x: 0,
        y: 0,
        fg: { r: 255, g: 255, b: 255 },
        bg: { r: 0, g: 0, b: 0 },
      });

      buffer.clear();

      expect(buffer.getCell(0, 0)!.char).toBe(" ");
      expect(buffer.getCursor()).toEqual({ row: 0, col: 0 });
    });
  });

  describe("toJSON", () => {
    it("should export buffer as JSON", () => {
      const json = buffer.toJSON();

      expect(json.rows.length).toBe(24);
      expect(json.rows[0].cells.length).toBe(40);
      expect(json.cursor).toEqual({ row: 0, col: 0 });
      expect(typeof json.lastUpdate).toBe("number");
    });
  });
});
