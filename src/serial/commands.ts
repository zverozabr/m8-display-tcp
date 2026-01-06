/**
 * M8 Command Parser
 * Parses SLIP frames into structured commands
 */

import {
  M8Command,
  type ParsedCommand,
  type RectCommand,
  type TextCommand,
  type WaveCommand,
  type JpadCommand,
  type SystemCommand,
  type Color,
} from "../state/types";

/**
 * Read 16-bit little-endian value
 */
function readU16LE(data: Uint8Array, offset: number): number {
  return data[offset] | (data[offset + 1] << 8);
}

/**
 * Read RGB color from 3 bytes
 */
function readColor(data: Uint8Array, offset: number): Color {
  return {
    r: data[offset],
    g: data[offset + 1],
    b: data[offset + 2],
  };
}

// Static state for RECT commands (like m8c's static rectcmd)
// When color is omitted, use the last drawn color
let lastRectColor: Color = { r: 0, g: 0, b: 0 };

/**
 * Parse RECT command (0xFE)
 * Variable length: 5, 8, 9, or 12 bytes
 * If colors are omitted, use the last drawn color (like m8c)
 */
function parseRect(data: Uint8Array): RectCommand | null {
  const len = data.length;

  if (len < 5) return null;

  const x = readU16LE(data, 1);
  const y = readU16LE(data, 3);

  let width = 1;
  let height = 1;

  if (len === 5) {
    // Position only, 1x1, use previous color
  } else if (len === 8) {
    // Position + color (1x1)
    lastRectColor = readColor(data, 5);
  } else if (len === 9) {
    // Position + size, use previous color
    width = readU16LE(data, 5);
    height = readU16LE(data, 7);
  } else if (len >= 12) {
    // Full: position + size + color
    width = readU16LE(data, 5);
    height = readU16LE(data, 7);
    lastRectColor = readColor(data, 9);
  }

  return {
    type: "rect",
    x,
    y,
    width,
    height,
    color: { ...lastRectColor }, // Copy to avoid mutation
  };
}

/**
 * Parse TEXT command (0xFD)
 * 12 bytes: cmd, char, x(2), y(2), fg(3), bg(3)
 */
function parseText(data: Uint8Array): TextCommand | null {
  if (data.length < 12) return null;

  const charCode = data[1];
  const x = readU16LE(data, 2);
  const y = readU16LE(data, 4);
  const fg = readColor(data, 6);
  const bg = readColor(data, 9);

  return {
    type: "text",
    char: charCode >= 32 && charCode < 127 ? String.fromCharCode(charCode) : " ",
    charCode,
    x,
    y,
    fg,
    bg,
  };
}

/**
 * Parse WAVE command (0xFC)
 * 4+ bytes: cmd, r, g, b, [waveform data up to 480 bytes]
 */
function parseWave(data: Uint8Array): WaveCommand | null {
  if (data.length < 4) return null;

  const color = readColor(data, 1);
  const waveData = data.slice(4);

  return {
    type: "wave",
    color,
    data: waveData,
  };
}

/**
 * Parse JPAD command (0xFB)
 * 3 bytes: cmd, state_low, state_high
 */
function parseJpad(data: Uint8Array): JpadCommand | null {
  if (data.length < 2) return null;

  const state = data.length >= 3 ? readU16LE(data, 1) : data[1];

  return {
    type: "jpad",
    state,
  };
}

/**
 * Parse SYSTEM command (0xFF)
 * 6 bytes: cmd, hw_type, fw_major, fw_minor, fw_patch, font_mode
 */
function parseSystem(data: Uint8Array): SystemCommand | null {
  if (data.length < 6) return null;

  return {
    type: "system",
    hardwareType: data[1],
    firmwareMajor: data[2],
    firmwareMinor: data[3],
    firmwarePatch: data[4],
    fontMode: data[5],
  };
}

/**
 * Parse a SLIP frame into a command
 */
export function parseCommand(frame: Uint8Array): ParsedCommand | null {
  if (frame.length === 0) return null;

  const cmd = frame[0];

  switch (cmd) {
    case M8Command.RECT:
      return parseRect(frame);
    case M8Command.TEXT:
      return parseText(frame);
    case M8Command.WAVE:
      return parseWave(frame);
    case M8Command.JPAD:
      return parseJpad(frame);
    case M8Command.SYSTEM:
      return parseSystem(frame);
    default:
      return null;
  }
}

/**
 * Command type guard functions
 */
export function isRectCommand(cmd: ParsedCommand): cmd is RectCommand {
  return cmd.type === "rect";
}

export function isTextCommand(cmd: ParsedCommand): cmd is TextCommand {
  return cmd.type === "text";
}

export function isWaveCommand(cmd: ParsedCommand): cmd is WaveCommand {
  return cmd.type === "wave";
}

export function isJpadCommand(cmd: ParsedCommand): cmd is JpadCommand {
  return cmd.type === "jpad";
}

export function isSystemCommand(cmd: ParsedCommand): cmd is SystemCommand {
  return cmd.type === "system";
}
