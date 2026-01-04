/**
 * AudioHub Tests
 * TDD: Tests first, then implementation
 * Multi-client audio distribution hub
 */

import { describe, it, expect, beforeEach, mock } from "bun:test";
import { AudioHub } from "../src/audio/audio-hub";

// Mock WebSocket
const createMockWs = () => ({
  readyState: 1, // OPEN
  OPEN: 1,
  send: mock(() => {}),
  on: mock(() => {}),
});

describe("AudioHub", () => {
  let hub: AudioHub;

  beforeEach(() => {
    hub = new AudioHub();
  });

  describe("client management", () => {
    it("should add WebSocket client", () => {
      const ws = createMockWs();
      hub.addClient(ws as any);
      expect(hub.clientCount).toBe(1);
    });

    it("should remove WebSocket client", () => {
      const ws = createMockWs();
      hub.addClient(ws as any);
      hub.removeClient(ws as any);
      expect(hub.clientCount).toBe(0);
    });

    it("should handle multiple clients", () => {
      const ws1 = createMockWs();
      const ws2 = createMockWs();
      const ws3 = createMockWs();

      hub.addClient(ws1 as any);
      hub.addClient(ws2 as any);
      hub.addClient(ws3 as any);

      expect(hub.clientCount).toBe(3);
    });
  });

  describe("broadcast", () => {
    it("should broadcast to all connected clients", () => {
      const ws1 = createMockWs();
      const ws2 = createMockWs();

      hub.addClient(ws1 as any);
      hub.addClient(ws2 as any);

      const audioData = Buffer.from([1, 2, 3, 4]);
      hub.onAudioData(audioData);

      expect(ws1.send).toHaveBeenCalled();
      expect(ws2.send).toHaveBeenCalled();
    });

    it("should frame audio data with 0x00 prefix", () => {
      const ws = createMockWs();
      hub.addClient(ws as any);

      const audioData = Buffer.from([1, 2, 3, 4]);
      hub.onAudioData(audioData);

      const sentData = ws.send.mock.calls[0][0] as Buffer;
      expect(sentData[0]).toBe(0x00); // Audio prefix
      expect(sentData.slice(1)).toEqual(audioData);
    });

    it("should remove dead clients on send error", () => {
      const ws = createMockWs();
      ws.send = mock(() => { throw new Error("Connection closed"); });

      hub.addClient(ws as any);
      expect(hub.clientCount).toBe(1);

      hub.onAudioData(Buffer.from([1, 2, 3]));

      expect(hub.clientCount).toBe(0);
    });

    it("should skip clients with non-OPEN readyState", () => {
      const ws = createMockWs();
      ws.readyState = 3; // CLOSED

      hub.addClient(ws as any);
      hub.onAudioData(Buffer.from([1, 2, 3]));

      expect(ws.send).not.toHaveBeenCalled();
    });
  });

  describe("file recording", () => {
    it("should start recording to file", async () => {
      await hub.startRecording("/tmp/test-audio.raw");
      expect(hub.isRecording).toBe(true);
    });

    it("should stop recording", async () => {
      await hub.startRecording("/tmp/test-audio.raw");
      await hub.stopRecording();
      expect(hub.isRecording).toBe(false);
    });

    it("should write audio data to file while recording", async () => {
      await hub.startRecording("/tmp/test-audio.raw");

      const audioData = Buffer.from([1, 2, 3, 4]);
      hub.onAudioData(audioData);

      await hub.stopRecording();

      // Verify file was created (cleanup after)
      const file = Bun.file("/tmp/test-audio.raw");
      expect(await file.exists()).toBe(true);

      // Cleanup
      await Bun.write("/tmp/test-audio.raw", "");
    });

    it("should broadcast and record simultaneously", async () => {
      const ws = createMockWs();
      hub.addClient(ws as any);
      await hub.startRecording("/tmp/test-simultaneous.raw");

      const audioData = Buffer.from([1, 2, 3, 4]);
      hub.onAudioData(audioData);

      expect(ws.send).toHaveBeenCalled(); // Broadcast happened
      expect(hub.isRecording).toBe(true);  // Recording active

      await hub.stopRecording();
    });
  });

  describe("control messages", () => {
    it("should broadcast error with 0x01 prefix", () => {
      const ws = createMockWs();
      hub.addClient(ws as any);

      hub.broadcastError("Test error");

      const sentData = ws.send.mock.calls[0][0] as Buffer;
      expect(sentData[0]).toBe(0x01); // Control prefix
    });
  });

  describe("integration: multiple clients + file", () => {
    it("should handle 3 clients + file recording simultaneously", async () => {
      const ws1 = createMockWs();
      const ws2 = createMockWs();
      const ws3 = createMockWs();

      hub.addClient(ws1 as any);
      hub.addClient(ws2 as any);
      hub.addClient(ws3 as any);
      await hub.startRecording("/tmp/test-multi.raw");

      // Simulate receiving 10 audio packets
      for (let i = 0; i < 10; i++) {
        hub.onAudioData(Buffer.from([i, i + 1, i + 2, i + 3]));
      }

      expect(ws1.send).toHaveBeenCalledTimes(10);
      expect(ws2.send).toHaveBeenCalledTimes(10);
      expect(ws3.send).toHaveBeenCalledTimes(10);

      await hub.stopRecording();

      // Verify file has data (10 packets * 4 bytes = 40 bytes)
      const file = Bun.file("/tmp/test-multi.raw");
      expect(file.size).toBe(40);
    });
  });
});
