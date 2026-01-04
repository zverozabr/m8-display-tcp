/**
 * M8 Text Buffer
 * 53×24 character grid with colors, built from TEXT commands
 */

import type { Color, TextCell, TextCommand, RectCommand } from "../state/types";

// M8 screen dimensions
export const SCREEN_WIDTH = 320;
export const SCREEN_HEIGHT = 240;
export const CHAR_WIDTH = 8;
export const CHAR_HEIGHT = 10;
export const COLS = 40; // 320 / 8
export const ROWS = 24; // 240 / 10

// Default colors
const BLACK: Color = { r: 0, g: 0, b: 0 };
const WHITE: Color = { r: 255, g: 255, b: 255 };

// Highlight color threshold (for cursor detection)
const HIGHLIGHT_THRESHOLD = 200;

/**
 * Check if color is a highlight (cursor) color
 */
function isHighlight(color: Color): boolean {
  return color.r > HIGHLIGHT_THRESHOLD && color.g > HIGHLIGHT_THRESHOLD;
}

/**
 * Create empty cell
 */
function emptyCell(): TextCell {
  return {
    char: " ",
    fg: WHITE,
    bg: BLACK,
  };
}

/**
 * M8 Display Text Buffer
 */
export class TextBuffer {
  private cells: TextCell[][];
  private cursorRow: number = 0;
  private cursorCol: number = 0;
  private lastUpdate: number = 0;

  constructor() {
    this.cells = this.createEmptyGrid();
  }

  private createEmptyGrid(): TextCell[][] {
    return Array.from({ length: ROWS }, () =>
      Array.from({ length: COLS }, () => emptyCell())
    );
  }

  /**
   * Apply TEXT command to buffer
   */
  applyText(cmd: TextCommand): void {
    const col = Math.floor(cmd.x / CHAR_WIDTH);
    const row = Math.floor(cmd.y / CHAR_HEIGHT);

    if (row >= 0 && row < ROWS && col >= 0 && col < COLS) {
      this.cells[row][col] = {
        char: cmd.char,
        fg: cmd.fg,
        bg: cmd.bg,
      };

      // Detect cursor by highlight color
      if (isHighlight(cmd.fg)) {
        this.cursorRow = row;
        this.cursorCol = col;
      }

      this.lastUpdate = Date.now();
    }
  }

  /**
   * Apply RECT command (for screen clears)
   */
  applyRect(cmd: RectCommand): void {
    // Full screen clear
    if (cmd.x === 0 && cmd.y === 0 && cmd.width >= SCREEN_WIDTH && cmd.height >= SCREEN_HEIGHT) {
      this.clear();
    }
    // Partial clear - fill with spaces
    else {
      const startCol = Math.floor(cmd.x / CHAR_WIDTH);
      const startRow = Math.floor(cmd.y / CHAR_HEIGHT);
      const endCol = Math.ceil((cmd.x + cmd.width) / CHAR_WIDTH);
      const endRow = Math.ceil((cmd.y + cmd.height) / CHAR_HEIGHT);

      for (let row = startRow; row < endRow && row < ROWS; row++) {
        for (let col = startCol; col < endCol && col < COLS; col++) {
          if (row >= 0 && col >= 0) {
            this.cells[row][col] = {
              char: " ",
              fg: WHITE,
              bg: cmd.color,
            };
          }
        }
      }
    }
    this.lastUpdate = Date.now();
  }

  /**
   * Clear entire buffer
   */
  clear(): void {
    this.cells = this.createEmptyGrid();
    this.cursorRow = 0;
    this.cursorCol = 0;
    this.lastUpdate = Date.now();
  }

  /**
   * Get cell at position
   */
  getCell(row: number, col: number): TextCell | null {
    if (row >= 0 && row < ROWS && col >= 0 && col < COLS) {
      return this.cells[row][col];
    }
    return null;
  }

  /**
   * Get cursor position
   */
  getCursor(): { row: number; col: number } {
    return { row: this.cursorRow, col: this.cursorCol };
  }

  /**
   * Get last update timestamp
   */
  getLastUpdate(): number {
    return this.lastUpdate;
  }

  /**
   * Render buffer as plain text
   */
  toText(): string {
    return this.cells
      .map((row) => row.map((cell) => cell.char).join("").trimEnd())
      .join("\n")
      .trimEnd();
  }

  /**
   * Render buffer as plain text with cursor marker
   */
  toTextWithCursor(): string {
    return this.cells
      .map((row, r) =>
        row
          .map((cell, c) => {
            if (r === this.cursorRow && c === this.cursorCol) {
              return `[${cell.char}]`;
            }
            return cell.char;
          })
          .join("")
          .trimEnd()
      )
      .join("\n")
      .trimEnd();
  }

  /**
   * Get specific row as text
   */
  getRow(row: number): string {
    if (row >= 0 && row < ROWS) {
      return this.cells[row].map((cell) => cell.char).join("").trimEnd();
    }
    return "";
  }

  /**
   * Get header row (usually screen title)
   */
  getHeader(): string {
    return this.getRow(0);
  }

  /**
   * Export full buffer with colors as JSON
   */
  toJSON(): {
    rows: { cells: TextCell[] }[];
    cursor: { row: number; col: number };
    lastUpdate: number;
  } {
    return {
      rows: this.cells.map((row) => ({ cells: row })),
      cursor: this.getCursor(),
      lastUpdate: this.lastUpdate,
    };
  }

  /**
   * Get dimensions
   */
  static get dimensions(): { rows: number; cols: number } {
    return { rows: ROWS, cols: COLS };
  }
}
