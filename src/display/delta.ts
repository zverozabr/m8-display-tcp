/**
 * Display Delta Tracker
 * Tracks command changes to skip duplicates and reduce TCP traffic
 *
 * For 4G optimization: skip unchanged TEXT/RECT commands
 * WAVE commands always sent (constantly changing)
 */

import type { ParsedCommand, TextCommand, RectCommand, Color } from "../state/types";

// Screen clear threshold (width * height)
const SCREEN_CLEAR_THRESHOLD = 320 * 200; // ~64000 pixels

/**
 * Statistics for monitoring delta efficiency
 */
interface DeltaStats {
  sent: number;
  skipped: number;
  ratio: number; // sent / total
}

/**
 * Hash for TEXT command comparison
 */
function textHash(cmd: TextCommand): string {
  return `T:${cmd.x}:${cmd.y}`;
}

/**
 * Hash for RECT command comparison (by position)
 */
function rectHash(cmd: RectCommand): string {
  return `R:${cmd.x}:${cmd.y}:${cmd.width}:${cmd.height}`;
}

/**
 * Compare colors for equality
 */
function colorEqual(a: Color, b: Color): boolean {
  return a.r === b.r && a.g === b.g && a.b === b.b;
}

/**
 * Check if TEXT commands are equal
 */
function textEqual(a: TextCommand, b: TextCommand): boolean {
  return (
    a.charCode === b.charCode &&
    colorEqual(a.fg, b.fg) &&
    colorEqual(a.bg, b.bg)
  );
}

/**
 * Check if RECT commands are equal (same position/size must have same color)
 */
function rectEqual(a: RectCommand, b: RectCommand): boolean {
  return colorEqual(a.color, b.color);
}

/**
 * Check if RECT is a screen clear (large rect covering most of screen)
 */
function isScreenClear(cmd: RectCommand): boolean {
  return cmd.width * cmd.height >= SCREEN_CLEAR_THRESHOLD;
}

/**
 * DisplayDelta - tracks command state to skip duplicates
 *
 * Usage:
 * ```typescript
 * const delta = new DisplayDelta();
 *
 * connection.onCommand = (cmd) => {
 *   if (delta.shouldSend(cmd)) {
 *     tcpProxy.broadcast(cmd);
 *   }
 * };
 * ```
 */
export class DisplayDelta {
  private textCache = new Map<string, TextCommand>();
  private rectCache = new Map<string, RectCommand>();

  private sentCount = 0;
  private skippedCount = 0;

  /**
   * Check if command should be sent (not a duplicate)
   * Also updates internal state
   */
  shouldSend(cmd: ParsedCommand): boolean {
    // WAVE commands always sent (real-time waveform)
    if (cmd.type === "wave") {
      this.sentCount++;
      return true;
    }

    // JPAD and SYSTEM commands always sent (state changes)
    if (cmd.type === "jpad" || cmd.type === "system") {
      this.sentCount++;
      return true;
    }

    if (cmd.type === "text") {
      return this.checkText(cmd);
    }

    if (cmd.type === "rect") {
      return this.checkRect(cmd);
    }

    // Unknown command type - send it
    this.sentCount++;
    return true;
  }

  /**
   * Check TEXT command for changes
   */
  private checkText(cmd: TextCommand): boolean {
    const key = textHash(cmd);
    const cached = this.textCache.get(key);

    if (cached && textEqual(cached, cmd)) {
      this.skippedCount++;
      return false;
    }

    // Store a copy to avoid mutation
    this.textCache.set(key, {
      ...cmd,
      fg: { ...cmd.fg },
      bg: { ...cmd.bg },
    });
    this.sentCount++;
    return true;
  }

  /**
   * Check RECT command for changes
   * Also handles screen clear detection
   */
  private checkRect(cmd: RectCommand): boolean {
    // Screen clear - reset caches and always send
    if (isScreenClear(cmd)) {
      this.textCache.clear();
      this.rectCache.clear();
      this.sentCount++;
      return true;
    }

    const key = rectHash(cmd);
    const cached = this.rectCache.get(key);

    if (cached && rectEqual(cached, cmd)) {
      this.skippedCount++;
      return false;
    }

    // Store a copy
    this.rectCache.set(key, {
      ...cmd,
      color: { ...cmd.color },
    });
    this.sentCount++;
    return true;
  }

  /**
   * Clear all cached state
   * Call on reconnect or manual reset
   */
  reset(): void {
    this.textCache.clear();
    this.rectCache.clear();
  }

  /**
   * Get statistics
   */
  getStats(): DeltaStats {
    const total = this.sentCount + this.skippedCount;
    return {
      sent: this.sentCount,
      skipped: this.skippedCount,
      ratio: total > 0 ? this.sentCount / total : 1,
    };
  }

  /**
   * Reset statistics (but keep cache)
   */
  resetStats(): void {
    this.sentCount = 0;
    this.skippedCount = 0;
  }

  /**
   * Get cache sizes for debugging
   */
  getCacheSizes(): { text: number; rect: number } {
    return {
      text: this.textCache.size,
      rect: this.rectCache.size,
    };
  }
}
