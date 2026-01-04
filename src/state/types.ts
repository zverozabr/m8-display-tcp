/**
 * M8 Tracker Type Definitions
 */

// Colors
export interface Color {
  r: number;
  g: number;
  b: number;
}

// Commands from M8
export const M8Command = {
  RECT: 0xfe,
  TEXT: 0xfd,
  WAVE: 0xfc,
  JPAD: 0xfb,
  SYSTEM: 0xff,
} as const;

export type M8CommandType = (typeof M8Command)[keyof typeof M8Command];

// Rectangle command
export interface RectCommand {
  type: "rect";
  x: number;
  y: number;
  width: number;
  height: number;
  color: Color;
}

// Text/Character command
export interface TextCommand {
  type: "text";
  char: string;
  charCode: number;
  x: number;
  y: number;
  fg: Color;
  bg: Color;
}

// Waveform command (oscilloscope)
export interface WaveCommand {
  type: "wave";
  color: Color;
  data: Uint8Array;
}

// Joypad state echo
export interface JpadCommand {
  type: "jpad";
  state: number;
}

// System info
export interface SystemCommand {
  type: "system";
  hardwareType: number;
  firmwareMajor: number;
  firmwareMinor: number;
  firmwarePatch: number;
  fontMode: number;
}

export type ParsedCommand =
  | RectCommand
  | TextCommand
  | WaveCommand
  | JpadCommand
  | SystemCommand;

// Button bitmask for sending to M8
export const M8Key = {
  LEFT: 0x80,
  UP: 0x40,
  DOWN: 0x20,
  SELECT: 0x10, // SHIFT on M8
  START: 0x08,
  RIGHT: 0x04,
  OPT: 0x02,
  EDIT: 0x01,
} as const;

export type M8KeyName =
  | "left"
  | "up"
  | "down"
  | "right"
  | "shift"
  | "start"
  | "opt"
  | "edit";

// M8 Screen types
export type M8Screen =
  | "LIVE"
  | "SONG"
  | "CHAIN"
  | "PHRASE"
  | "INST"
  | "TABLE"
  | "PROJECT"
  | "MIXER"
  | "EFFECTS"
  | "GROOVE"
  | "SCALE"
  | "UNKNOWN";

// Text cell in buffer
export interface TextCell {
  char: string;
  fg: Color;
  bg: Color;
}

// Full M8 state
export interface M8State {
  screen: M8Screen;
  number: number; // phrase/chain/instrument number
  row: number;
  col: number;
  confidence: number;
  lastVerified: number;
  chainNum: number;
  chainRow: number;
  _lastHorizontal?: M8Screen;
}

// Connection state
export interface ConnectionState {
  connected: boolean;
  port: string;
  playing: boolean;
  firmware?: {
    major: number;
    minor: number;
    patch: number;
  };
}

// Hardware types
export const HardwareType = {
  HEADLESS: 0,
  BETA: 1,
  PRODUCTION: 2,
  MODEL_02: 3,
} as const;
