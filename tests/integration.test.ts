/**
 * M8 Display Integration Tests
 * Tests Web UI, Audio, and Key presses
 *
 * Run: npx tsx --test tests/integration.test.ts
 */

import { describe, it, before } from "node:test";
import assert from "node:assert";

const BASE_URL = "http://localhost:8080";

describe("M8 Display Server", () => {
  before(async () => {
    try {
      const res = await fetch(`${BASE_URL}/api/health`);
      if (!res.ok) throw new Error("Server not healthy");
    } catch {
      console.log("⚠️  Server not running. Start with: npx tsx src/index.ts");
      process.exit(1);
    }
  });

  describe("Health API", () => {
    it("GET /api/health returns connection status", async () => {
      const res = await fetch(`${BASE_URL}/api/health`);
      assert.ok(res.ok);

      const data = await res.json() as Record<string, unknown>;
      assert.ok("connected" in data);
      assert.ok("port" in data);
      assert.ok("clients" in data);
    });
  });

  describe("Screen API", () => {
    it("GET /api/screen returns text buffer JSON", async () => {
      const res = await fetch(`${BASE_URL}/api/screen`);
      assert.ok(res.ok);

      const data = await res.json() as { rows: { cells: unknown[] }[] };
      assert.ok("rows" in data);
      assert.ok(Array.isArray(data.rows));
      assert.ok(data.rows.length > 0);
      assert.ok("cells" in data.rows[0]);
    });

    it("GET /api/screen/text returns plain text", async () => {
      const res = await fetch(`${BASE_URL}/api/screen/text`);
      assert.ok(res.ok);

      const text = await res.text();
      assert.strictEqual(typeof text, "string");
      assert.ok(text.length > 0);
    });
  });

  describe("Key API", () => {
    it("POST /api/key/up sends UP key", async () => {
      const res = await fetch(`${BASE_URL}/api/key/up`, { method: "POST" });
      assert.ok(res.ok);

      const data = await res.json() as { ok: boolean; key: string };
      assert.strictEqual(data.ok, true);
      assert.strictEqual(data.key, "up");
    });

    it("POST /api/key/down sends DOWN key", async () => {
      const res = await fetch(`${BASE_URL}/api/key/down`, { method: "POST" });
      assert.ok(res.ok);

      const data = await res.json() as { ok: boolean; key: string };
      assert.strictEqual(data.ok, true);
      assert.strictEqual(data.key, "down");
    });

    it("POST /api/key/invalid returns 400", async () => {
      const res = await fetch(`${BASE_URL}/api/key/invalid`, { method: "POST" });
      assert.strictEqual(res.status, 400);
    });

    it("POST /api/keys sends combo", async () => {
      const res = await fetch(`${BASE_URL}/api/keys`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hold: "shift", press: "up" }),
      });
      assert.ok(res.ok);

      const data = await res.json() as { ok: boolean; hold: string; press: string };
      assert.strictEqual(data.ok, true);
      assert.strictEqual(data.hold, "shift");
      assert.strictEqual(data.press, "up");
    });
  });

  describe("State API", () => {
    it("GET /api/state returns tracker state", async () => {
      const res = await fetch(`${BASE_URL}/api/state`);
      assert.ok(res.ok);

      const data = await res.json() as Record<string, unknown>;
      assert.ok("screen" in data);
      assert.ok("row" in data);
      assert.ok("col" in data);
    });
  });

  describe("Audio API", () => {
    it("GET /api/audio/devices lists audio devices", async () => {
      const res = await fetch(`${BASE_URL}/api/audio/devices`);
      assert.ok(res.ok);

      const data = await res.json() as { devices: unknown[] };
      assert.ok("devices" in data);
      assert.ok(Array.isArray(data.devices));
    });
  });

  describe("Web UI", () => {
    it("GET / returns HTML page", async () => {
      const res = await fetch(`${BASE_URL}/`);
      assert.ok(res.ok);

      const html = await res.text();
      assert.ok(html.includes("<!DOCTYPE html>"));
      assert.ok(html.includes("M8"));
      assert.ok(html.includes("<canvas"));
    });

    it("Web UI has control buttons", async () => {
      const res = await fetch(`${BASE_URL}/`);
      const html = await res.text();

      assert.ok(html.includes('data-key="up"'));
      assert.ok(html.includes('data-key="down"'));
      assert.ok(html.includes('data-key="shift"'));
      assert.ok(html.includes('data-key="edit"'));
    });

    it("Web UI has WebSocket code", async () => {
      const res = await fetch(`${BASE_URL}/`);
      const html = await res.text();

      assert.ok(html.includes("WebSocket"));
      assert.ok(html.includes("/control")); // Control channel
      assert.ok(html.includes("/screen"));  // Screen channel
    });
  });

  describe("Reset API", () => {
    it("POST /api/reset resets display", async () => {
      const res = await fetch(`${BASE_URL}/api/reset`, { method: "POST" });
      assert.ok(res.ok);

      const data = await res.json() as { ok: boolean };
      assert.strictEqual(data.ok, true);
    });
  });
});
