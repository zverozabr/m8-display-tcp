/**
 * WebSocket Input Tests
 * Tests key input via WebSocket (instead of HTTP REST)
 *
 * NOTE: These tests require a running server with M8 connected.
 * They are automatically skipped in CI or when server is not available.
 *
 * Run locally with server: npx tsx src/index.ts (then npm test)
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { WebSocket } from "ws";

const BASE_URL = "http://localhost:8080";
const CONTROL_WS_URL = "ws://localhost:8080/control";

// Skip all tests if in CI or server not running
let serverAvailable = false;
let ws: WebSocket | null = null;

beforeAll(async () => {
  // Skip in CI environment (GitHub Actions sets both CI and GITHUB_ACTIONS)
  if (process.env.CI || process.env.GITHUB_ACTIONS) {
    console.log("⏭️  Skipping WebSocket tests in CI (no server)");
    return;
  }

  // Check server is running
  try {
    const res = await fetch(`${BASE_URL}/api/health`);
    if (res.ok) {
      serverAvailable = true;
      // Connect to control channel
      ws = new WebSocket(CONTROL_WS_URL);
      await new Promise<void>((resolve, reject) => {
        ws!.on("open", () => resolve());
        ws!.on("error", reject);
        setTimeout(() => reject(new Error("WebSocket connection timeout")), 5000);
      });
    }
  } catch {
    console.log("⏭️  Server not running, skipping WebSocket tests");
  }
});

afterAll(() => {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.close();
  }
});

// Helper to skip test if server not available
const skipIfNoServer = () => {
  if (!serverAvailable || !ws) {
    return true;
  }
  return false;
};

describe("WebSocket Input", () => {
  describe("Single Key Input", () => {
    it("sends UP key via WebSocket", async () => {
      if (skipIfNoServer()) return;
      ws!.send(JSON.stringify({ type: "key", key: "up" }));
      await new Promise((r) => setTimeout(r, 100));
      expect(ws!.readyState).toBe(WebSocket.OPEN);
    });

    it("sends DOWN key via WebSocket", async () => {
      if (skipIfNoServer()) return;
      ws!.send(JSON.stringify({ type: "key", key: "down" }));
      await new Promise((r) => setTimeout(r, 100));
      expect(ws!.readyState).toBe(WebSocket.OPEN);
    });

    it("sends LEFT key via WebSocket", async () => {
      if (skipIfNoServer()) return;
      ws!.send(JSON.stringify({ type: "key", key: "left" }));
      await new Promise((r) => setTimeout(r, 100));
      expect(ws!.readyState).toBe(WebSocket.OPEN);
    });

    it("sends RIGHT key via WebSocket", async () => {
      if (skipIfNoServer()) return;
      ws!.send(JSON.stringify({ type: "key", key: "right" }));
      await new Promise((r) => setTimeout(r, 100));
      expect(ws!.readyState).toBe(WebSocket.OPEN);
    });

    it("sends SHIFT key via WebSocket", async () => {
      if (skipIfNoServer()) return;
      ws!.send(JSON.stringify({ type: "key", key: "shift" }));
      await new Promise((r) => setTimeout(r, 100));
      expect(ws!.readyState).toBe(WebSocket.OPEN);
    });

    it("sends EDIT key via WebSocket", async () => {
      if (skipIfNoServer()) return;
      ws!.send(JSON.stringify({ type: "key", key: "edit" }));
      await new Promise((r) => setTimeout(r, 100));
      expect(ws!.readyState).toBe(WebSocket.OPEN);
    });

    it("sends OPT key via WebSocket", async () => {
      if (skipIfNoServer()) return;
      ws!.send(JSON.stringify({ type: "key", key: "opt" }));
      await new Promise((r) => setTimeout(r, 100));
      expect(ws!.readyState).toBe(WebSocket.OPEN);
    });

    it("sends START key via WebSocket", async () => {
      if (skipIfNoServer()) return;
      ws!.send(JSON.stringify({ type: "key", key: "start" }));
      await new Promise((r) => setTimeout(r, 100));
      expect(ws!.readyState).toBe(WebSocket.OPEN);
    });
  });

  describe("Combo Key Input", () => {
    it("sends SHIFT+UP combo via WebSocket", async () => {
      if (skipIfNoServer()) return;
      ws!.send(JSON.stringify({ type: "keys", hold: "shift", press: "up" }));
      await new Promise((r) => setTimeout(r, 150));
      expect(ws!.readyState).toBe(WebSocket.OPEN);
    });

    it("sends SHIFT+DOWN combo via WebSocket", async () => {
      if (skipIfNoServer()) return;
      ws!.send(JSON.stringify({ type: "keys", hold: "shift", press: "down" }));
      await new Promise((r) => setTimeout(r, 150));
      expect(ws!.readyState).toBe(WebSocket.OPEN);
    });

    it("sends EDIT+UP combo via WebSocket", async () => {
      if (skipIfNoServer()) return;
      ws!.send(JSON.stringify({ type: "keys", hold: "edit", press: "up" }));
      await new Promise((r) => setTimeout(r, 150));
      expect(ws!.readyState).toBe(WebSocket.OPEN);
    });

    it("sends OPT+UP combo via WebSocket", async () => {
      if (skipIfNoServer()) return;
      ws!.send(JSON.stringify({ type: "keys", hold: "opt", press: "up" }));
      await new Promise((r) => setTimeout(r, 150));
      expect(ws!.readyState).toBe(WebSocket.OPEN);
    });
  });

  describe("Keyjazz Input", () => {
    it("sends note on via WebSocket", async () => {
      if (skipIfNoServer()) return;
      ws!.send(JSON.stringify({ type: "note", note: 60, vel: 100 }));
      await new Promise((r) => setTimeout(r, 100));
      expect(ws!.readyState).toBe(WebSocket.OPEN);
    });

    it("sends note off via WebSocket", async () => {
      if (skipIfNoServer()) return;
      ws!.send(JSON.stringify({ type: "noteOff" }));
      await new Promise((r) => setTimeout(r, 100));
      expect(ws!.readyState).toBe(WebSocket.OPEN);
    });
  });

  describe("Error Handling", () => {
    it("handles invalid message type gracefully", async () => {
      if (skipIfNoServer()) return;
      ws!.send(JSON.stringify({ type: "invalid", data: "test" }));
      await new Promise((r) => setTimeout(r, 100));
      expect(ws!.readyState).toBe(WebSocket.OPEN);
    });

    it("handles malformed JSON gracefully", async () => {
      if (skipIfNoServer()) return;
      ws!.send("not valid json {{{");
      await new Promise((r) => setTimeout(r, 100));
      expect(ws!.readyState).toBe(WebSocket.OPEN);
    });
  });
});
