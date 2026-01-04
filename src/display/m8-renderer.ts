/**
 * M8 Renderer - Client-side rendering of M8 display commands
 * Based on m8c render.c logic
 *
 * SOLID: Single responsibility - only renders M8 commands to canvas
 */

import { M8_FONTS, type M8Font, loadFontImage } from "./m8-fonts";

// M8 command types (from m8c command.c)
export const CMD_RECTANGLE = 0xFE;
export const CMD_CHARACTER = 0xFD;
export const CMD_WAVEFORM = 0xFC;
export const CMD_JOYPAD = 0xFB;
export const CMD_SYSTEM_INFO = 0xFF;

export interface Color {
  r: number;
  g: number;
  b: number;
}

export interface DrawRectangleCommand {
  type: typeof CMD_RECTANGLE;
  x: number;
  y: number;
  width: number;
  height: number;
  color: Color;
}

export interface DrawCharacterCommand {
  type: typeof CMD_CHARACTER;
  char: number;
  x: number;
  y: number;
  fg: Color;
  bg: Color;
}

export interface DrawWaveformCommand {
  type: typeof CMD_WAVEFORM;
  color: Color;
  waveform: number[];
}

export interface SystemInfoCommand {
  type: typeof CMD_SYSTEM_INFO;
  hardwareType: number;
  firmwareVersion: [number, number, number];
  fontMode: number;
}

export type M8Command = DrawRectangleCommand | DrawCharacterCommand | DrawWaveformCommand | SystemInfoCommand;

/**
 * M8 Display Renderer
 */
export class M8Renderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private fontImages: Map<number, HTMLImageElement> = new Map();
  private currentFont: M8Font;
  private fontMode = 0;
  private backgroundColor: Color = { r: 0, g: 0, b: 0 };
  private screenOffsetY = 0;
  private textOffsetY = 0;
  private waveformMaxHeight = 24;
  private dirty = false;

  // Screen dimensions
  readonly width: number;
  readonly height: number;

  constructor(canvas: HTMLCanvasElement, width = 320, height = 240) {
    this.canvas = canvas;
    this.width = width;
    this.height = height;
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Failed to get canvas context");
    this.ctx = ctx;
    this.ctx.imageSmoothingEnabled = false;

    this.currentFont = M8_FONTS[0];
    this.clear();
  }

  /**
   * Load all font images
   */
  async loadFonts(): Promise<void> {
    for (let i = 0; i < M8_FONTS.length; i++) {
      const img = await loadFontImage(M8_FONTS[i]);
      this.fontImages.set(i, img);
    }
  }

  /**
   * Set font mode (0-4)
   */
  setFontMode(mode: number): void {
    if (mode < 0 || mode >= M8_FONTS.length) return;
    this.fontMode = mode;
    this.currentFont = M8_FONTS[mode];
    this.screenOffsetY = this.currentFont.screenOffsetY;
    this.textOffsetY = this.currentFont.textOffsetY;
    this.waveformMaxHeight = this.currentFont.waveformMaxHeight;
  }

  /**
   * Clear screen with background color
   */
  clear(): void {
    this.ctx.fillStyle = this.colorToCSS(this.backgroundColor);
    this.ctx.fillRect(0, 0, this.width, this.height);
  }

  /**
   * Process M8 command
   */
  processCommand(cmd: M8Command): void {
    switch (cmd.type) {
      case CMD_RECTANGLE:
        this.drawRectangle(cmd);
        break;
      case CMD_CHARACTER:
        this.drawCharacter(cmd);
        break;
      case CMD_WAVEFORM:
        this.drawWaveform(cmd);
        break;
      case CMD_SYSTEM_INFO:
        this.handleSystemInfo(cmd);
        break;
    }
    this.dirty = true;
  }

  /**
   * Parse command from binary data
   */
  parseCommand(data: Uint8Array): M8Command | null {
    if (data.length === 0) return null;

    const cmd = data[0];

    switch (cmd) {
      case CMD_RECTANGLE:
        return this.parseRectangle(data);
      case CMD_CHARACTER:
        return this.parseCharacter(data);
      case CMD_WAVEFORM:
        return this.parseWaveform(data);
      case CMD_SYSTEM_INFO:
        return this.parseSystemInfo(data);
      default:
        return null;
    }
  }

  private parseRectangle(data: Uint8Array): DrawRectangleCommand | null {
    // Variable length: 5, 8, 9, or 12 bytes
    const x = data[1] | (data[2] << 8);
    const y = data[3] | (data[4] << 8);

    let width = 1, height = 1;
    let color = this.backgroundColor;

    if (data.length === 5) {
      // Position only
    } else if (data.length === 8) {
      // Position + color
      color = { r: data[5], g: data[6], b: data[7] };
    } else if (data.length === 9) {
      // Position + size
      width = data[5] | (data[6] << 8);
      height = data[7] | (data[8] << 8);
    } else if (data.length === 12) {
      // Position + size + color
      width = data[5] | (data[6] << 8);
      height = data[7] | (data[8] << 8);
      color = { r: data[9], g: data[10], b: data[11] };
    } else {
      return null;
    }

    return { type: CMD_RECTANGLE, x, y, width, height, color };
  }

  private parseCharacter(data: Uint8Array): DrawCharacterCommand | null {
    if (data.length !== 12) return null;

    return {
      type: CMD_CHARACTER,
      char: data[1],
      x: data[2] | (data[3] << 8),
      y: data[4] | (data[5] << 8),
      fg: { r: data[6], g: data[7], b: data[8] },
      bg: { r: data[9], g: data[10], b: data[11] },
    };
  }

  private parseWaveform(data: Uint8Array): DrawWaveformCommand | null {
    if (data.length < 4) return null;

    return {
      type: CMD_WAVEFORM,
      color: { r: data[1], g: data[2], b: data[3] },
      waveform: Array.from(data.slice(4)),
    };
  }

  private parseSystemInfo(data: Uint8Array): SystemInfoCommand | null {
    if (data.length !== 6) return null;

    return {
      type: CMD_SYSTEM_INFO,
      hardwareType: data[1],
      firmwareVersion: [data[2], data[3], data[4]],
      fontMode: data[5],
    };
  }

  private drawRectangle(cmd: DrawRectangleCommand): void {
    // Check for background color change (fullscreen rect)
    if (cmd.x === 0 && cmd.y <= 0 && cmd.width === this.width && cmd.height >= this.height) {
      this.backgroundColor = cmd.color;
    }

    this.ctx.fillStyle = this.colorToCSS(cmd.color);
    this.ctx.fillRect(cmd.x, cmd.y + this.screenOffsetY, cmd.width, cmd.height);
  }

  private drawCharacter(cmd: DrawCharacterCommand): void {
    const fontImg = this.fontImages.get(this.fontMode);
    if (!fontImg) return;

    const font = this.currentFont;
    const charCode = cmd.char;

    // Font starts at ASCII 33 (!), font_offset = 127 - 94 = 33
    const glyphIndex = charCode - 33;
    if (glyphIndex < 0 || glyphIndex >= 94) return;

    const srcX = glyphIndex * font.glyphX;
    const srcY = 0;
    const dstX = cmd.x;
    const dstY = cmd.y + this.textOffsetY + this.screenOffsetY;

    // Always draw background to clear old content (KISS fix for overlay bug)
    this.ctx.fillStyle = this.colorToCSS(cmd.bg);
    this.ctx.fillRect(dstX, dstY, font.glyphX, font.glyphY);

    // Draw character using canvas compositing
    // The font is 1-bit (white on transparent), we need to colorize it
    this.ctx.save();

    // Draw font image (white pixels)
    this.ctx.drawImage(
      fontImg,
      srcX, srcY, font.glyphX, font.glyphY,
      dstX, dstY, font.glyphX, font.glyphY
    );

    // Colorize using composite mode
    this.ctx.globalCompositeOperation = "source-atop";
    this.ctx.fillStyle = this.colorToCSS(cmd.fg);
    this.ctx.fillRect(dstX, dstY, font.glyphX, font.glyphY);

    this.ctx.restore();
  }

  private drawWaveform(cmd: DrawWaveformCommand): void {
    const waveformSize = cmd.waveform.length;
    if (waveformSize === 0) return;

    // Clear waveform area
    const wfX = this.width - waveformSize;
    this.ctx.fillStyle = this.colorToCSS(this.backgroundColor);
    this.ctx.fillRect(wfX, 0, waveformSize, this.waveformMaxHeight + 1);

    // Draw waveform points
    this.ctx.fillStyle = this.colorToCSS(cmd.color);
    for (let i = 0; i < waveformSize; i++) {
      const y = Math.min(cmd.waveform[i], this.waveformMaxHeight);
      this.ctx.fillRect(wfX + i, y, 1, 1);
    }
  }

  private handleSystemInfo(cmd: SystemInfoCommand): void {
    // MK2 model uses larger screen (480x320)
    if (cmd.hardwareType === 0x03) {
      // TODO: Handle MK2 screen size
    }
    this.setFontMode(cmd.fontMode);
  }

  private colorToCSS(color: Color): string {
    return `rgb(${color.r},${color.g},${color.b})`;
  }

  /**
   * Check if screen needs refresh
   */
  isDirty(): boolean {
    return this.dirty;
  }

  /**
   * Mark as rendered
   */
  markClean(): void {
    this.dirty = false;
  }
}

/**
 * Parse multiple commands from WebSocket message
 */
export function parseCommands(data: Uint8Array): M8Command[] {
  const commands: M8Command[] = [];
  // Commands are SLIP-encoded, need to parse frames
  // For now, assume single command per message
  // TODO: Implement SLIP decoder if needed
  return commands;
}
