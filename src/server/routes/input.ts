/**
 * Input Routes - Single Responsibility: M8 input control
 */

import type { IncomingMessage, ServerResponse } from "http";
import { jsonResponse, parseBody, delay } from "../helpers";
import type { M8Connection } from "../../serial/connection";
import type { M8StateTracker } from "../../state/tracker";
import { keyToBitmask, isValidKey, createCombo } from "../../input/keys";
import type { M8KeyName } from "../../state/types";

export interface InputDependencies {
  connection: M8Connection;
  stateTracker: M8StateTracker;
}

/**
 * Create input route handlers
 * @param deps Dependencies injected (Dependency Inversion)
 */
export function createInputRoutes(deps: InputDependencies) {
  /**
   * Press single key helper
   */
  async function pressKey(key: M8KeyName): Promise<void> {
    const bitmask = keyToBitmask(key);
    console.log("pressKey:", key, "bitmask:", bitmask);
    await deps.connection.sendKeys(bitmask);
    await delay(50);
    await deps.connection.sendKeys(0);
    deps.stateTracker.onKey(key);
  }

  /**
   * Press key combo helper
   */
  async function pressCombo(hold: M8KeyName, press: M8KeyName): Promise<void> {
    const sequence = createCombo(hold, press);
    for (const step of sequence) {
      await deps.connection.sendKeys(step.bitmask);
      if (step.duration > 0) {
        await delay(step.duration);
      }
    }
    deps.stateTracker.onCombo(hold, press);
  }

  return {
    /**
     * POST /api/raw
     * Send raw bitmask (low-level direct control)
     */
    async postRaw(req: IncomingMessage, res: ServerResponse): Promise<void> {
      const body = await parseBody<{ bitmask: number; holdMs?: number; release?: boolean }>(req);
      const { bitmask, holdMs, release } = body;

      if (typeof bitmask !== "number" || bitmask < 0 || bitmask > 255) {
        jsonResponse(res, { error: "Invalid bitmask (0-255)" }, 400);
        return;
      }

      await deps.connection.sendKeys(bitmask);
      if (holdMs && holdMs > 0) {
        await delay(holdMs);
        if (release !== false) {
          await deps.connection.sendKeys(0);
        }
      }
      jsonResponse(res, { ok: true, bitmask, holdMs });
    },

    /**
     * POST /api/key/:key
     * Send single key press
     */
    async postKey(res: ServerResponse, key: string): Promise<void> {
      if (!isValidKey(key)) {
        jsonResponse(res, { error: `Invalid key: ${key}` }, 400);
        return;
      }
      await pressKey(key);
      jsonResponse(res, { ok: true, key });
    },

    /**
     * POST /api/keys
     * Send key combo
     */
    async postKeys(req: IncomingMessage, res: ServerResponse): Promise<void> {
      const body = await parseBody<{ hold?: string; press?: string }>(req);
      const { hold, press } = body;

      if (press && isValidKey(press)) {
        if (hold && isValidKey(hold)) {
          await pressCombo(hold, press);
        } else {
          await pressKey(press);
        }
        jsonResponse(res, { ok: true, hold, press });
        return;
      }
      jsonResponse(res, { error: "Invalid keys" }, 400);
    },

    /**
     * POST /api/note
     * Send note on
     */
    async postNote(req: IncomingMessage, res: ServerResponse): Promise<void> {
      const body = await parseBody<{ note: number; vel?: number }>(req);
      const { note, vel } = body;
      await deps.connection.sendNoteOn(note, vel ?? 100);
      jsonResponse(res, { ok: true, note, vel: vel ?? 100 });
    },

    /**
     * POST /api/note/off
     * Send note off
     */
    async postNoteOff(res: ServerResponse): Promise<void> {
      await deps.connection.sendNoteOff();
      jsonResponse(res, { ok: true });
    },

    /**
     * POST /api/reset
     * Reset M8 display
     */
    async postReset(res: ServerResponse): Promise<void> {
      await deps.connection.reset();
      deps.stateTracker.reset();
      jsonResponse(res, { ok: true });
    },

    // Expose helpers for WebSocket handler
    pressKey,
    pressCombo,
  };
}
