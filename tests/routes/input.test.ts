/**
 * Input Routes Unit Tests (TDD)
 */

import { describe, it, expect, mock, beforeEach } from "bun:test";
import { createInputRoutes } from "../../src/server/routes/input";
import { Readable } from "stream";

// Helper to create mock request with body
function createMockRequest(body: object): any {
  const readable = new Readable();
  readable.push(JSON.stringify(body));
  readable.push(null);
  return readable;
}

describe("Input Routes", () => {
  let mockConnection: any;
  let mockStateTracker: any;

  beforeEach(() => {
    mockConnection = {
      sendKeys: mock(async () => {}),
      sendNoteOn: mock(async () => {}),
      sendNoteOff: mock(async () => {}),
      reset: mock(async () => {}),
    };

    mockStateTracker = {
      onKey: mock(() => {}),
      onCombo: mock(() => {}),
      reset: mock(() => {}),
    };
  });

  describe("postRaw", () => {
    it("sends raw bitmask", async () => {
      const routes = createInputRoutes({
        connection: mockConnection,
        stateTracker: mockStateTracker,
      });

      const req = createMockRequest({ bitmask: 64 });
      const res = {
        writeHead: mock(() => {}),
        end: mock(() => {}),
      };

      await routes.postRaw(req, res as any);

      expect(mockConnection.sendKeys).toHaveBeenCalledWith(64);
      const response = JSON.parse(res.end.mock.calls[0][0]);
      expect(response).toHaveProperty("ok", true);
      expect(response).toHaveProperty("bitmask", 64);
    });

    it("rejects invalid bitmask", async () => {
      const routes = createInputRoutes({
        connection: mockConnection,
        stateTracker: mockStateTracker,
      });

      const req = createMockRequest({ bitmask: 300 });
      const res = {
        writeHead: mock(() => {}),
        end: mock(() => {}),
      };

      await routes.postRaw(req, res as any);

      expect(res.writeHead).toHaveBeenCalledWith(400, {
        "Content-Type": "application/json",
      });
      const response = JSON.parse(res.end.mock.calls[0][0]);
      expect(response).toHaveProperty("error");
    });

    it("handles holdMs with release", async () => {
      const routes = createInputRoutes({
        connection: mockConnection,
        stateTracker: mockStateTracker,
      });

      const req = createMockRequest({ bitmask: 32, holdMs: 10 });
      const res = {
        writeHead: mock(() => {}),
        end: mock(() => {}),
      };

      await routes.postRaw(req, res as any);

      // Should send bitmask, then after delay send 0
      expect(mockConnection.sendKeys).toHaveBeenCalledTimes(2);
      expect(mockConnection.sendKeys.mock.calls[0][0]).toBe(32);
      expect(mockConnection.sendKeys.mock.calls[1][0]).toBe(0);
    });
  });

  describe("postKey", () => {
    it("sends valid key", async () => {
      const routes = createInputRoutes({
        connection: mockConnection,
        stateTracker: mockStateTracker,
      });

      const res = {
        writeHead: mock(() => {}),
        end: mock(() => {}),
      };

      await routes.postKey(res as any, "up");

      expect(mockConnection.sendKeys).toHaveBeenCalled();
      expect(mockStateTracker.onKey).toHaveBeenCalledWith("up");
      const response = JSON.parse(res.end.mock.calls[0][0]);
      expect(response).toHaveProperty("ok", true);
      expect(response).toHaveProperty("key", "up");
    });

    it("rejects invalid key", async () => {
      const routes = createInputRoutes({
        connection: mockConnection,
        stateTracker: mockStateTracker,
      });

      const res = {
        writeHead: mock(() => {}),
        end: mock(() => {}),
      };

      await routes.postKey(res as any, "invalid");

      expect(res.writeHead).toHaveBeenCalledWith(400, {
        "Content-Type": "application/json",
      });
    });
  });

  describe("postKeys (combo)", () => {
    it("sends combo with hold and press", async () => {
      const routes = createInputRoutes({
        connection: mockConnection,
        stateTracker: mockStateTracker,
      });

      const req = createMockRequest({ hold: "shift", press: "up" });
      const res = {
        writeHead: mock(() => {}),
        end: mock(() => {}),
      };

      await routes.postKeys(req, res as any);

      expect(mockStateTracker.onCombo).toHaveBeenCalledWith("shift", "up");
      const response = JSON.parse(res.end.mock.calls[0][0]);
      expect(response).toHaveProperty("ok", true);
    });

    it("sends single key when no hold", async () => {
      const routes = createInputRoutes({
        connection: mockConnection,
        stateTracker: mockStateTracker,
      });

      const req = createMockRequest({ press: "down" });
      const res = {
        writeHead: mock(() => {}),
        end: mock(() => {}),
      };

      await routes.postKeys(req, res as any);

      expect(mockStateTracker.onKey).toHaveBeenCalledWith("down");
    });
  });

  describe("postNote", () => {
    it("sends note on", async () => {
      const routes = createInputRoutes({
        connection: mockConnection,
        stateTracker: mockStateTracker,
      });

      const req = createMockRequest({ note: 60, vel: 100 });
      const res = {
        writeHead: mock(() => {}),
        end: mock(() => {}),
      };

      await routes.postNote(req, res as any);

      expect(mockConnection.sendNoteOn).toHaveBeenCalledWith(60, 100);
    });

    it("uses default velocity", async () => {
      const routes = createInputRoutes({
        connection: mockConnection,
        stateTracker: mockStateTracker,
      });

      const req = createMockRequest({ note: 48 });
      const res = {
        writeHead: mock(() => {}),
        end: mock(() => {}),
      };

      await routes.postNote(req, res as any);

      expect(mockConnection.sendNoteOn).toHaveBeenCalledWith(48, 100);
    });
  });

  describe("postNoteOff", () => {
    it("sends note off", async () => {
      const routes = createInputRoutes({
        connection: mockConnection,
        stateTracker: mockStateTracker,
      });

      const res = {
        writeHead: mock(() => {}),
        end: mock(() => {}),
      };

      await routes.postNoteOff(res as any);

      expect(mockConnection.sendNoteOff).toHaveBeenCalled();
    });
  });

  describe("postReset", () => {
    it("resets connection and state", async () => {
      const routes = createInputRoutes({
        connection: mockConnection,
        stateTracker: mockStateTracker,
      });

      const res = {
        writeHead: mock(() => {}),
        end: mock(() => {}),
      };

      await routes.postReset(res as any);

      expect(mockConnection.reset).toHaveBeenCalled();
      expect(mockStateTracker.reset).toHaveBeenCalled();
    });
  });
});
