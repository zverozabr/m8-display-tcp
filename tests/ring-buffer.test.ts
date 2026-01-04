/**
 * RingBuffer Tests
 * TDD: Tests first, then implementation
 */

import { describe, it, expect } from "bun:test";
import { RingBuffer } from "../src/audio/ring-buffer";

describe("RingBuffer", () => {
  describe("basic operations", () => {
    it("should create buffer with specified size", () => {
      const buffer = new RingBuffer(1024);
      expect(buffer.capacity).toBe(1024);
      expect(buffer.length).toBe(0);
      expect(buffer.available).toBe(1024);
    });

    it("should push and pop data correctly", () => {
      const buffer = new RingBuffer(1024);
      const data = new Uint8Array([1, 2, 3, 4, 5]);

      const pushed = buffer.push(data);
      expect(pushed).toBe(5);
      expect(buffer.length).toBe(5);
      expect(buffer.available).toBe(1019);

      const out = new Uint8Array(5);
      const popped = buffer.pop(out);
      expect(popped).toBe(5);
      expect(out).toEqual(data);
      expect(buffer.length).toBe(0);
    });

    it("should handle partial reads", () => {
      const buffer = new RingBuffer(1024);
      buffer.push(new Uint8Array([1, 2, 3, 4, 5]));

      const out = new Uint8Array(3);
      const popped = buffer.pop(out);
      expect(popped).toBe(3);
      expect(out).toEqual(new Uint8Array([1, 2, 3]));
      expect(buffer.length).toBe(2);

      const out2 = new Uint8Array(2);
      buffer.pop(out2);
      expect(out2).toEqual(new Uint8Array([4, 5]));
    });
  });

  describe("wraparound", () => {
    it("should wrap around correctly", () => {
      const buffer = new RingBuffer(8);

      // Fill half
      buffer.push(new Uint8Array([1, 2, 3, 4]));

      // Read half
      const out1 = new Uint8Array(4);
      buffer.pop(out1);
      expect(out1).toEqual(new Uint8Array([1, 2, 3, 4]));

      // Push again (should wrap around)
      buffer.push(new Uint8Array([5, 6, 7, 8, 9, 10]));
      expect(buffer.length).toBe(6);

      // Read all
      const out2 = new Uint8Array(6);
      buffer.pop(out2);
      expect(out2).toEqual(new Uint8Array([5, 6, 7, 8, 9, 10]));
    });
  });

  describe("overflow handling", () => {
    it("should return -1 on overflow (no overwrite)", () => {
      const buffer = new RingBuffer(4);

      buffer.push(new Uint8Array([1, 2, 3, 4]));
      expect(buffer.length).toBe(4);
      expect(buffer.available).toBe(0);

      const result = buffer.push(new Uint8Array([5]));
      expect(result).toBe(-1); // overflow
      expect(buffer.length).toBe(4); // unchanged
    });

    it("should overwrite when allowOverwrite=true", () => {
      const buffer = new RingBuffer(4, { allowOverwrite: true });

      buffer.push(new Uint8Array([1, 2, 3, 4]));
      const pushed = buffer.push(new Uint8Array([5, 6]));
      expect(pushed).toBe(2);

      const out = new Uint8Array(4);
      buffer.pop(out);
      // Oldest data dropped, newest preserved
      expect(out).toEqual(new Uint8Array([3, 4, 5, 6]));
    });
  });

  describe("underflow handling", () => {
    it("should return 0 bytes on empty buffer", () => {
      const buffer = new RingBuffer(1024);
      const out = new Uint8Array(10);

      const popped = buffer.pop(out);
      expect(popped).toBe(0);
    });

    it("should return available bytes if less than requested", () => {
      const buffer = new RingBuffer(1024);
      buffer.push(new Uint8Array([1, 2, 3]));

      const out = new Uint8Array(10);
      const popped = buffer.pop(out);
      expect(popped).toBe(3);
      expect(out.slice(0, 3)).toEqual(new Uint8Array([1, 2, 3]));
    });
  });

  describe("peek", () => {
    it("should peek without consuming", () => {
      const buffer = new RingBuffer(1024);
      buffer.push(new Uint8Array([1, 2, 3, 4, 5]));

      const out1 = new Uint8Array(3);
      buffer.peek(out1);
      expect(out1).toEqual(new Uint8Array([1, 2, 3]));
      expect(buffer.length).toBe(5); // not consumed

      const out2 = new Uint8Array(5);
      buffer.pop(out2);
      expect(out2).toEqual(new Uint8Array([1, 2, 3, 4, 5]));
    });
  });

  describe("clear", () => {
    it("should clear all data", () => {
      const buffer = new RingBuffer(1024);
      buffer.push(new Uint8Array([1, 2, 3, 4, 5]));
      expect(buffer.length).toBe(5);

      buffer.clear();
      expect(buffer.length).toBe(0);
      expect(buffer.available).toBe(1024);
    });
  });

  describe("audio buffer size (256KB)", () => {
    it("should handle large audio buffer", () => {
      const SIZE = 256 * 1024; // 256KB
      const buffer = new RingBuffer(SIZE);

      // Push ~100ms of audio (44100 * 2ch * 2bytes * 0.1s = ~17KB)
      const audioChunk = new Uint8Array(17640);
      for (let i = 0; i < audioChunk.length; i++) {
        audioChunk[i] = i & 0xFF;
      }

      buffer.push(audioChunk);
      expect(buffer.length).toBe(17640);

      const out = new Uint8Array(17640);
      buffer.pop(out);
      expect(out).toEqual(audioChunk);
    });
  });
});
