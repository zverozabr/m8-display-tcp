/**
 * WebSocket Input Tests
 * Tests key input via WebSocket (instead of HTTP REST)
 *
 * Run: npx tsx --test tests/ws-input.test.ts
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import { WebSocket } from "ws";

const BASE_URL = "http://localhost:8080";
const CONTROL_WS_URL = "ws://localhost:8080/control";  // Input-only channel

describe("WebSocket Input", () => {
  let ws: WebSocket;

  before(async () => {
    // Check server is running
    try {
      const res = await fetch(`${BASE_URL}/api/health`);
      if (!res.ok) throw new Error("Server not healthy");
    } catch {
      console.log("⚠️  Server not running. Start with: npx tsx src/index.ts");
      process.exit(1);
    }

    // Connect to control channel
    ws = new WebSocket(CONTROL_WS_URL);
    await new Promise<void>((resolve, reject) => {
      ws.on("open", () => resolve());
      ws.on("error", reject);
      setTimeout(() => reject(new Error("WebSocket connection timeout")), 5000);
    });
  });

  after(() => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.close();
    }
  });

  describe("Single Key Input", () => {
    it("sends UP key via WebSocket", async () => {
      const message = { type: "key", key: "up" };
      ws.send(JSON.stringify(message));

      // Give M8 time to process
      await new Promise((r) => setTimeout(r, 100));

      // Verify connection still open (no error)
      assert.strictEqual(ws.readyState, WebSocket.OPEN);
    });

    it("sends DOWN key via WebSocket", async () => {
      const message = { type: "key", key: "down" };
      ws.send(JSON.stringify(message));
      await new Promise((r) => setTimeout(r, 100));
      assert.strictEqual(ws.readyState, WebSocket.OPEN);
    });

    it("sends LEFT key via WebSocket", async () => {
      const message = { type: "key", key: "left" };
      ws.send(JSON.stringify(message));
      await new Promise((r) => setTimeout(r, 100));
      assert.strictEqual(ws.readyState, WebSocket.OPEN);
    });

    it("sends RIGHT key via WebSocket", async () => {
      const message = { type: "key", key: "right" };
      ws.send(JSON.stringify(message));
      await new Promise((r) => setTimeout(r, 100));
      assert.strictEqual(ws.readyState, WebSocket.OPEN);
    });

    it("sends SHIFT key via WebSocket", async () => {
      const message = { type: "key", key: "shift" };
      ws.send(JSON.stringify(message));
      await new Promise((r) => setTimeout(r, 100));
      assert.strictEqual(ws.readyState, WebSocket.OPEN);
    });

    it("sends EDIT key via WebSocket", async () => {
      const message = { type: "key", key: "edit" };
      ws.send(JSON.stringify(message));
      await new Promise((r) => setTimeout(r, 100));
      assert.strictEqual(ws.readyState, WebSocket.OPEN);
    });

    it("sends OPT key via WebSocket", async () => {
      const message = { type: "key", key: "opt" };
      ws.send(JSON.stringify(message));
      await new Promise((r) => setTimeout(r, 100));
      assert.strictEqual(ws.readyState, WebSocket.OPEN);
    });

    it("sends START key via WebSocket", async () => {
      const message = { type: "key", key: "start" };
      ws.send(JSON.stringify(message));
      await new Promise((r) => setTimeout(r, 100));
      assert.strictEqual(ws.readyState, WebSocket.OPEN);
    });
  });

  describe("Combo Key Input", () => {
    it("sends SHIFT+UP combo via WebSocket", async () => {
      const message = { type: "keys", hold: "shift", press: "up" };
      ws.send(JSON.stringify(message));
      await new Promise((r) => setTimeout(r, 150));
      assert.strictEqual(ws.readyState, WebSocket.OPEN);
    });

    it("sends SHIFT+DOWN combo via WebSocket", async () => {
      const message = { type: "keys", hold: "shift", press: "down" };
      ws.send(JSON.stringify(message));
      await new Promise((r) => setTimeout(r, 150));
      assert.strictEqual(ws.readyState, WebSocket.OPEN);
    });

    it("sends SHIFT+LEFT combo via WebSocket", async () => {
      const message = { type: "keys", hold: "shift", press: "left" };
      ws.send(JSON.stringify(message));
      await new Promise((r) => setTimeout(r, 150));
      assert.strictEqual(ws.readyState, WebSocket.OPEN);
    });

    it("sends SHIFT+RIGHT combo via WebSocket", async () => {
      const message = { type: "keys", hold: "shift", press: "right" };
      ws.send(JSON.stringify(message));
      await new Promise((r) => setTimeout(r, 150));
      assert.strictEqual(ws.readyState, WebSocket.OPEN);
    });

    it("sends EDIT+UP combo via WebSocket", async () => {
      const message = { type: "keys", hold: "edit", press: "up" };
      ws.send(JSON.stringify(message));
      await new Promise((r) => setTimeout(r, 150));
      assert.strictEqual(ws.readyState, WebSocket.OPEN);
    });

    it("sends OPT+UP combo via WebSocket", async () => {
      const message = { type: "keys", hold: "opt", press: "up" };
      ws.send(JSON.stringify(message));
      await new Promise((r) => setTimeout(r, 150));
      assert.strictEqual(ws.readyState, WebSocket.OPEN);
    });
  });

  describe("Keyjazz Input", () => {
    it("sends note on via WebSocket", async () => {
      const message = { type: "note", note: 60, vel: 100 };
      ws.send(JSON.stringify(message));
      await new Promise((r) => setTimeout(r, 100));
      assert.strictEqual(ws.readyState, WebSocket.OPEN);
    });

    it("sends note off via WebSocket", async () => {
      const message = { type: "noteOff" };
      ws.send(JSON.stringify(message));
      await new Promise((r) => setTimeout(r, 100));
      assert.strictEqual(ws.readyState, WebSocket.OPEN);
    });

    it("sends note with different velocity", async () => {
      const message = { type: "note", note: 72, vel: 50 };
      ws.send(JSON.stringify(message));
      await new Promise((r) => setTimeout(r, 100));

      // Note off
      ws.send(JSON.stringify({ type: "noteOff" }));
      await new Promise((r) => setTimeout(r, 100));

      assert.strictEqual(ws.readyState, WebSocket.OPEN);
    });
  });

  describe("Multiple WebSocket Clients", () => {
    it("handles multiple concurrent connections", async () => {
      const ws2 = new WebSocket(CONTROL_WS_URL);
      await new Promise<void>((resolve, reject) => {
        ws2.on("open", () => resolve());
        ws2.on("error", reject);
        setTimeout(() => reject(new Error("Timeout")), 5000);
      });

      // Both clients can send
      ws.send(JSON.stringify({ type: "key", key: "up" }));
      ws2.send(JSON.stringify({ type: "key", key: "down" }));

      await new Promise((r) => setTimeout(r, 100));

      assert.strictEqual(ws.readyState, WebSocket.OPEN);
      assert.strictEqual(ws2.readyState, WebSocket.OPEN);

      ws2.close();
    });
  });

  describe("Error Handling", () => {
    it("handles invalid message type gracefully", async () => {
      const message = { type: "invalid", data: "test" };
      ws.send(JSON.stringify(message));
      await new Promise((r) => setTimeout(r, 100));

      // Connection should still be open
      assert.strictEqual(ws.readyState, WebSocket.OPEN);
    });

    it("handles malformed JSON gracefully", async () => {
      ws.send("not valid json {{{");
      await new Promise((r) => setTimeout(r, 100));

      // Connection should still be open (server ignores malformed messages)
      assert.strictEqual(ws.readyState, WebSocket.OPEN);
    });
  });
});
