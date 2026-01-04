/**
 * M8 State Tracker
 * Tracks cursor position and screen state
 */

import type { M8State, M8Screen, M8KeyName } from "./types";

// Screen constants
const HORIZONTAL_ORDER: M8Screen[] = ["LIVE", "SONG", "CHAIN", "PHRASE", "INST", "TABLE"];

const MAX_ROWS: Record<M8Screen, number> = {
  SONG: 256,
  CHAIN: 16,
  PHRASE: 16,
  TABLE: 16,
  MIXER: 14,
  INST: 32,
  PROJECT: 20,
  EFFECTS: 16,
  GROOVE: 16,
  SCALE: 12,
  LIVE: 8,
};

const COLUMNS: Record<M8Screen, number> = {
  SONG: 8,
  CHAIN: 2,
  PHRASE: 6,
  TABLE: 5,
  MIXER: 3,
  INST: 2,
  PROJECT: 2,
  EFFECTS: 2,
  GROOVE: 2,
  SCALE: 2,
  LIVE: 8,
};

// Screen transitions (SHIFT + direction)
const TRANSITIONS: Record<string, M8Screen> = {
  // Horizontal
  "LIVE:right": "SONG",
  "SONG:right": "CHAIN",
  "CHAIN:right": "PHRASE",
  "PHRASE:right": "INST",
  "INST:right": "TABLE",
  "TABLE:left": "INST",
  "INST:left": "PHRASE",
  "PHRASE:left": "CHAIN",
  "CHAIN:left": "SONG",
  "SONG:left": "LIVE",
  // Vertical
  "SONG:up": "PROJECT",
  "PROJECT:down": "SONG",
  "PHRASE:up": "GROOVE",
  "GROOVE:down": "PHRASE",
  // To MIXER
  "LIVE:down": "MIXER",
  "SONG:down": "MIXER",
  "CHAIN:down": "MIXER",
  "PHRASE:down": "MIXER",
  "INST:down": "MIXER",
  "TABLE:down": "MIXER",
  // MIXER
  "MIXER:down": "EFFECTS",
  "EFFECTS:up": "MIXER",
};

/**
 * Create initial state
 */
function createState(screen: M8Screen = "SONG"): M8State {
  return {
    screen,
    number: 0,
    row: 0,
    col: 0,
    confidence: 1.0,
    lastVerified: Date.now(),
    chainNum: 0,
    chainRow: 0,
    _lastHorizontal: "SONG",
  };
}

/**
 * M8 State Tracker
 */
export class M8StateTracker {
  private state: M8State;
  private chainCache: Map<number, number[]> = new Map();

  constructor(initialScreen: M8Screen = "SONG") {
    this.state = createState(initialScreen);
  }

  /**
   * Get current state
   */
  getState(): M8State {
    return { ...this.state };
  }

  /**
   * Get state as API response
   */
  toJSON(): object {
    return {
      screen: this.state.screen,
      number: this.state.number,
      row: this.state.row,
      col: this.state.col,
      confidence: Math.round(this.state.confidence * 1000) / 1000,
      lastVerified: this.state.lastVerified,
      chainNum: this.state.chainNum,
      chainRow: this.state.chainRow,
    };
  }

  /**
   * Apply single key press
   */
  onKey(key: M8KeyName): M8State {
    const maxRow = (MAX_ROWS[this.state.screen] || 16) - 1;
    const maxCol = (COLUMNS[this.state.screen] || 6) - 1;

    // Slight confidence decay
    this.state.confidence *= 0.99;

    switch (key) {
      case "down":
        this.state.row = Math.min(this.state.row + 1, maxRow);
        break;
      case "up":
        this.state.row = Math.max(this.state.row - 1, 0);
        break;
      case "right":
        this.state.col = Math.min(this.state.col + 1, maxCol);
        break;
      case "left":
        this.state.col = Math.max(this.state.col - 1, 0);
        break;
    }

    return this.getState();
  }

  /**
   * Apply key combination
   */
  onCombo(hold: M8KeyName, press: M8KeyName): M8State {
    // More confidence decay for combos
    this.state.confidence *= 0.98;

    if (hold === "shift") {
      // Special case: MIXER up returns to last horizontal
      if (this.state.screen === "MIXER" && press === "up") {
        this.state.screen = this.state._lastHorizontal || "SONG";
        return this.getState();
      }

      const key = `${this.state.screen}:${press}`;
      const newScreen = TRANSITIONS[key];
      if (newScreen) {
        // Track last horizontal before leaving
        if (HORIZONTAL_ORDER.includes(this.state.screen)) {
          this.state._lastHorizontal = this.state.screen;
        }
        this.state.screen = newScreen;
      }
    }

    // OPT + UP/DOWN for chain navigation
    if (hold === "opt" && (press === "up" || press === "down")) {
      const phrases = this.chainCache.get(this.state.chainNum);

      if (phrases && phrases.length > 0) {
        if (press === "down" && this.state.chainRow < phrases.length - 1) {
          this.state.chainRow++;
          this.state.number = phrases[this.state.chainRow];
          this.state.confidence *= 0.99;
        } else if (press === "up" && this.state.chainRow > 0) {
          this.state.chainRow--;
          this.state.number = phrases[this.state.chainRow];
          this.state.confidence *= 0.99;
        }
      } else {
        // Chain not in cache
        this.state.confidence *= 0.5;
      }
    }

    return this.getState();
  }

  /**
   * Reset state
   */
  reset(screen: M8Screen = "SONG"): M8State {
    this.state = createState(screen);
    this.state.confidence = 0.5;
    return this.getState();
  }

  /**
   * Manually set state
   */
  setState(updates: Partial<M8State>): M8State {
    if (updates.screen !== undefined) this.state.screen = updates.screen;
    if (updates.number !== undefined) this.state.number = updates.number;
    if (updates.row !== undefined) this.state.row = updates.row;
    if (updates.col !== undefined) this.state.col = updates.col;
    if (updates.confidence !== undefined) this.state.confidence = updates.confidence;
    if (updates.chainNum !== undefined) this.state.chainNum = updates.chainNum;
    if (updates.chainRow !== undefined) this.state.chainRow = updates.chainRow;

    this.state.lastVerified = Date.now();
    return this.getState();
  }

  /**
   * Set chain contents for OPT navigation
   */
  setChain(chainNum: number, phrases: number[]): void {
    this.chainCache.set(chainNum, phrases);
  }

  /**
   * Get chain contents
   */
  getChain(chainNum?: number): Record<number, number[]> {
    if (chainNum !== undefined) {
      const phrases = this.chainCache.get(chainNum);
      return { [chainNum]: phrases || [] };
    }
    return Object.fromEntries(this.chainCache);
  }

  /**
   * Get song structure
   */
  getSongStructure(): object {
    return {
      chains: Object.fromEntries(this.chainCache),
      trackCount: 8,
      currentScreen: this.state.screen,
      currentNumber: this.state.number,
    };
  }

  /**
   * Verify state (placeholder - would use screen detection)
   */
  verify(): M8State {
    this.state.lastVerified = Date.now();
    this.state.confidence = 1.0;
    return this.getState();
  }
}
