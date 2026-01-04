/**
 * SLIP Decoder Tests
 * TDD: Tests first, then implementation
 */

import { describe, it, expect } from "bun:test";
import { SlipDecoder, SLIP, slipEncode } from "../src/serial/slip";

describe("SLIP Protocol", () => {
  describe("SlipDecoder", () => {
    it("should decode simple frame", () => {
      const frames: Uint8Array[] = [];
      const decoder = new SlipDecoder((frame) => frames.push(frame));

      // Frame: [0x01, 0x02, 0x03] + END
      decoder.feed(new Uint8Array([0x01, 0x02, 0x03, SLIP.END]));

      expect(frames.length).toBe(1);
      expect(frames[0]).toEqual(new Uint8Array([0x01, 0x02, 0x03]));
    });

    it("should decode multiple frames", () => {
      const frames: Uint8Array[] = [];
      const decoder = new SlipDecoder((frame) => frames.push(frame));

      decoder.feed(new Uint8Array([0x01, SLIP.END, 0x02, 0x03, SLIP.END]));

      expect(frames.length).toBe(2);
      expect(frames[0]).toEqual(new Uint8Array([0x01]));
      expect(frames[1]).toEqual(new Uint8Array([0x02, 0x03]));
    });

    it("should handle escaped END byte", () => {
      const frames: Uint8Array[] = [];
      const decoder = new SlipDecoder((frame) => frames.push(frame));

      // ESC + ESC_END should become 0xC0
      decoder.feed(new Uint8Array([0x01, SLIP.ESC, SLIP.ESC_END, 0x02, SLIP.END]));

      expect(frames.length).toBe(1);
      expect(frames[0]).toEqual(new Uint8Array([0x01, SLIP.END, 0x02]));
    });

    it("should handle escaped ESC byte", () => {
      const frames: Uint8Array[] = [];
      const decoder = new SlipDecoder((frame) => frames.push(frame));

      // ESC + ESC_ESC should become 0xDB
      decoder.feed(new Uint8Array([0x01, SLIP.ESC, SLIP.ESC_ESC, 0x02, SLIP.END]));

      expect(frames.length).toBe(1);
      expect(frames[0]).toEqual(new Uint8Array([0x01, SLIP.ESC, 0x02]));
    });

    it("should handle fragmented input", () => {
      const frames: Uint8Array[] = [];
      const decoder = new SlipDecoder((frame) => frames.push(frame));

      // Send frame in chunks
      decoder.feed(new Uint8Array([0x01, 0x02]));
      decoder.feed(new Uint8Array([0x03, SLIP.END]));

      expect(frames.length).toBe(1);
      expect(frames[0]).toEqual(new Uint8Array([0x01, 0x02, 0x03]));
    });

    it("should ignore empty frames", () => {
      const frames: Uint8Array[] = [];
      const decoder = new SlipDecoder((frame) => frames.push(frame));

      // Multiple END bytes
      decoder.feed(new Uint8Array([SLIP.END, SLIP.END, 0x01, SLIP.END]));

      expect(frames.length).toBe(1);
      expect(frames[0]).toEqual(new Uint8Array([0x01]));
    });

    it("should reset state correctly", () => {
      const frames: Uint8Array[] = [];
      const decoder = new SlipDecoder((frame) => frames.push(frame));

      decoder.feed(new Uint8Array([0x01, 0x02]));
      expect(decoder.bufferSize).toBe(2);

      decoder.reset();
      expect(decoder.bufferSize).toBe(0);

      decoder.feed(new Uint8Array([0x03, SLIP.END]));
      expect(frames[0]).toEqual(new Uint8Array([0x03]));
    });
  });

  describe("slipEncode", () => {
    it("should encode simple data", () => {
      const data = new Uint8Array([0x01, 0x02, 0x03]);
      const encoded = slipEncode(data);

      expect(encoded).toEqual(new Uint8Array([0x01, 0x02, 0x03, SLIP.END]));
    });

    it("should escape END byte", () => {
      const data = new Uint8Array([0x01, SLIP.END, 0x02]);
      const encoded = slipEncode(data);

      expect(encoded).toEqual(
        new Uint8Array([0x01, SLIP.ESC, SLIP.ESC_END, 0x02, SLIP.END])
      );
    });

    it("should escape ESC byte", () => {
      const data = new Uint8Array([0x01, SLIP.ESC, 0x02]);
      const encoded = slipEncode(data);

      expect(encoded).toEqual(
        new Uint8Array([0x01, SLIP.ESC, SLIP.ESC_ESC, 0x02, SLIP.END])
      );
    });

    it("should handle round-trip encode/decode", () => {
      const original = new Uint8Array([0xFD, SLIP.END, SLIP.ESC, 0x00, 0xFF]);
      const encoded = slipEncode(original);

      const frames: Uint8Array[] = [];
      const decoder = new SlipDecoder((frame) => frames.push(frame));
      decoder.feed(encoded);

      expect(frames.length).toBe(1);
      expect(frames[0]).toEqual(original);
    });
  });
});
