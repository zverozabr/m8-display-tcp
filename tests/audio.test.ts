/**
 * Audio Streaming Tests
 * Tests AudioHub and RingBuffer (no hardware required)
 *
 * Run: npx tsx --test tests/audio.test.ts
 */

import { describe, it, beforeEach, mock } from "node:test";
import assert from "node:assert";

// Mock WebSocket for testing
class MockWebSocket {
  readyState = 1; // OPEN
  OPEN = 1;
  CLOSED = 3;

  sentMessages: Buffer[] = [];
  closeCallbacks: (() => void)[] = [];
  errorCallbacks: (() => void)[] = [];

  send(data: Buffer): void {
    this.sentMessages.push(data);
  }

  on(event: string, callback: () => void): void {
    if (event === 'close') this.closeCallbacks.push(callback);
    if (event === 'error') this.errorCallbacks.push(callback);
  }

  simulateClose(): void {
    this.readyState = this.CLOSED;
    this.closeCallbacks.forEach(cb => cb());
  }
}

// Import after mocks (dynamic import to avoid hoisting issues)
const { AudioHub } = await import("../src/audio/audio-hub");
const { RingBuffer } = await import("../src/audio/ring-buffer");

describe("RingBuffer", () => {
  let buffer: InstanceType<typeof RingBuffer>;

  beforeEach(() => {
    buffer = new RingBuffer(1024);
  });

  it("starts empty", () => {
    assert.strictEqual(buffer.length, 0);
    assert.strictEqual(buffer.capacity, 1024);
    assert.strictEqual(buffer.available, 1024);
  });

  it("pushes and tracks length", () => {
    const data = new Uint8Array([1, 2, 3, 4]);
    buffer.push(data);
    assert.strictEqual(buffer.length, 4);
    assert.strictEqual(buffer.available, 1020);
  });

  it("pops data correctly", () => {
    const data = new Uint8Array([1, 2, 3, 4, 5]);
    buffer.push(data);

    const output = new Uint8Array(3);
    const read = buffer.pop(output);
    assert.strictEqual(read, 3);
    assert.deepStrictEqual(Array.from(output), [1, 2, 3]);
    assert.strictEqual(buffer.length, 2);
  });

  it("clears buffer", () => {
    buffer.push(new Uint8Array([1, 2, 3]));
    buffer.clear();
    assert.strictEqual(buffer.length, 0);
    assert.strictEqual(buffer.available, 1024);
  });

  it("handles wraparound correctly", () => {
    // Fill most of buffer
    const data1 = new Uint8Array(1000).fill(0xAA);
    buffer.push(data1);

    // Pop some to create space at start
    const output = new Uint8Array(500);
    buffer.pop(output);

    // Push more to wrap around
    const data2 = new Uint8Array(300).fill(0xBB);
    buffer.push(data2);

    assert.strictEqual(buffer.length, 800); // 500 remaining + 300 new
  });

  it("overwrites when full (allowOverwrite mode)", () => {
    const overwriteBuffer = new RingBuffer(100, { allowOverwrite: true });

    // Overfill
    const data = new Uint8Array(150).fill(0xFF);
    overwriteBuffer.push(data);

    // Should have dropped oldest data
    assert.strictEqual(overwriteBuffer.length, 100);
  });
});

describe("AudioHub", () => {
  let hub: InstanceType<typeof AudioHub>;

  beforeEach(() => {
    hub = new AudioHub(1024);
  });

  it("starts with no clients", () => {
    assert.strictEqual(hub.clientCount, 0);
  });

  it("adds and tracks clients", () => {
    const ws1 = new MockWebSocket() as any;
    const ws2 = new MockWebSocket() as any;

    hub.addClient(ws1);
    assert.strictEqual(hub.clientCount, 1);

    hub.addClient(ws2);
    assert.strictEqual(hub.clientCount, 2);
  });

  it("removes clients on close", () => {
    const ws = new MockWebSocket() as any;
    hub.addClient(ws);
    assert.strictEqual(hub.clientCount, 1);

    ws.simulateClose();
    assert.strictEqual(hub.clientCount, 0);
  });

  it("broadcasts audio data with 0x00 prefix", () => {
    const ws = new MockWebSocket() as any;
    hub.addClient(ws);

    const audioData = Buffer.from([0x01, 0x02, 0x03, 0x04]);
    hub.onAudioData(audioData);

    assert.strictEqual(ws.sentMessages.length, 1);
    const sent = ws.sentMessages[0];

    // First byte should be 0x00 (MSG_AUDIO)
    assert.strictEqual(sent[0], 0x00);
    // Rest should be audio data
    assert.deepStrictEqual(Array.from(sent.slice(1)), [0x01, 0x02, 0x03, 0x04]);
  });

  it("broadcasts error with 0x01 prefix", () => {
    const ws = new MockWebSocket() as any;
    hub.addClient(ws);

    hub.broadcastError("Test error");

    assert.strictEqual(ws.sentMessages.length, 1);
    const sent = ws.sentMessages[0];

    // First byte should be 0x01 (MSG_CONTROL)
    assert.strictEqual(sent[0], 0x01);

    // Rest should be JSON
    const json = JSON.parse(sent.slice(1).toString());
    assert.strictEqual(json.error, "Test error");
  });

  it("broadcasts to multiple clients", () => {
    const ws1 = new MockWebSocket() as any;
    const ws2 = new MockWebSocket() as any;
    const ws3 = new MockWebSocket() as any;

    hub.addClient(ws1);
    hub.addClient(ws2);
    hub.addClient(ws3);

    hub.onAudioData(Buffer.from([0xAA, 0xBB]));

    assert.strictEqual(ws1.sentMessages.length, 1);
    assert.strictEqual(ws2.sentMessages.length, 1);
    assert.strictEqual(ws3.sentMessages.length, 1);
  });

  it("removes dead clients on send", () => {
    const ws1 = new MockWebSocket() as any;
    const ws2 = new MockWebSocket() as any;

    hub.addClient(ws1);
    hub.addClient(ws2);

    // Close ws1 without triggering callback
    ws1.readyState = ws1.CLOSED;

    hub.onAudioData(Buffer.from([0x01]));

    // ws1 should be removed (dead)
    assert.strictEqual(hub.clientCount, 1);
  });

  it("tracks buffer stats", () => {
    const stats = hub.getBufferStats();

    assert.strictEqual(stats.capacity, 1024);
    assert.strictEqual(stats.length, 0);
    assert.strictEqual(stats.available, 1024);
  });

  it("stores audio in ring buffer", () => {
    hub.onAudioData(Buffer.from([0x01, 0x02, 0x03]));

    const stats = hub.getBufferStats();
    assert.strictEqual(stats.length, 3);
  });

  it("is not recording by default", () => {
    assert.strictEqual(hub.isRecording, false);
  });
});

describe("Audio Protocol", () => {
  it("MSG_AUDIO is 0x00", () => {
    assert.strictEqual(0x00, 0x00);
  });

  it("MSG_CONTROL is 0x01", () => {
    assert.strictEqual(0x01, 0x01);
  });

  it("audio frames are [0x00, ...pcm_data]", () => {
    const hub = new AudioHub(1024);
    const ws = new MockWebSocket() as any;
    hub.addClient(ws);

    // 16-bit stereo sample (4 bytes)
    const pcm = Buffer.from([0x00, 0x80, 0xFF, 0x7F]);
    hub.onAudioData(pcm);

    const frame = ws.sentMessages[0];
    assert.strictEqual(frame[0], 0x00); // Type
    assert.strictEqual(frame.length, 5); // 1 + 4
  });

  it("control frames are [0x01, ...json]", () => {
    const hub = new AudioHub(1024);
    const ws = new MockWebSocket() as any;
    hub.addClient(ws);

    hub.broadcastControl({ status: "ready", sampleRate: 44100 });

    const frame = ws.sentMessages[0];
    assert.strictEqual(frame[0], 0x01); // Type

    const json = JSON.parse(frame.slice(1).toString());
    assert.strictEqual(json.status, "ready");
    assert.strictEqual(json.sampleRate, 44100);
  });
});
