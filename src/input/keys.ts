/**
 * M8 Key Input Handling
 * Button bitmask encoding for M8 Tracker
 */

import { M8Key, type M8KeyName } from "../state/types";

/**
 * Map key names to bitmask values
 */
const KEY_MAP: Record<M8KeyName, number> = {
  left: M8Key.LEFT,
  up: M8Key.UP,
  down: M8Key.DOWN,
  right: M8Key.RIGHT,
  shift: M8Key.SELECT, // SELECT = SHIFT on M8
  start: M8Key.START,
  opt: M8Key.OPT,
  edit: M8Key.EDIT,
};

/**
 * Convert key name to bitmask
 */
export function keyToBitmask(key: M8KeyName): number {
  return KEY_MAP[key] ?? 0;
}

/**
 * Combine multiple keys into single bitmask
 */
export function keysToBitmask(keys: M8KeyName[]): number {
  return keys.reduce((mask, key) => mask | keyToBitmask(key), 0);
}

/**
 * Parse bitmask to key names
 */
export function bitmaskToKeys(bitmask: number): M8KeyName[] {
  const keys: M8KeyName[] = [];

  if (bitmask & M8Key.LEFT) keys.push("left");
  if (bitmask & M8Key.UP) keys.push("up");
  if (bitmask & M8Key.DOWN) keys.push("down");
  if (bitmask & M8Key.RIGHT) keys.push("right");
  if (bitmask & M8Key.SELECT) keys.push("shift");
  if (bitmask & M8Key.START) keys.push("start");
  if (bitmask & M8Key.OPT) keys.push("opt");
  if (bitmask & M8Key.EDIT) keys.push("edit");

  return keys;
}

/**
 * Check if key name is valid
 */
export function isValidKey(key: string): key is M8KeyName {
  return key in KEY_MAP;
}

/**
 * Get all valid key names
 */
export function getValidKeys(): M8KeyName[] {
  return Object.keys(KEY_MAP) as M8KeyName[];
}

/**
 * Key press sequence helper
 * Creates array of bitmasks for press and release
 */
export interface KeySequence {
  bitmask: number;
  duration: number; // ms
}

/**
 * Create key press sequence (press, hold, release)
 */
export function createKeyPress(
  key: M8KeyName,
  holdMs: number = 50
): KeySequence[] {
  const bitmask = keyToBitmask(key);
  return [
    { bitmask, duration: holdMs },
    { bitmask: 0, duration: 0 },
  ];
}

/**
 * Create combo sequence (hold one key, press another)
 */
export function createCombo(
  hold: M8KeyName,
  press: M8KeyName,
  holdMs: number = 50
): KeySequence[] {
  const holdMask = keyToBitmask(hold);
  const pressMask = keyToBitmask(press);
  const comboMask = holdMask | pressMask;

  return [
    { bitmask: holdMask, duration: 20 }, // Hold modifier
    { bitmask: comboMask, duration: holdMs }, // Press both
    { bitmask: holdMask, duration: 20 }, // Release press
    { bitmask: 0, duration: 0 }, // Release all
  ];
}
