/**
 * Key Input Tests
 */

import { describe, it, expect } from "bun:test";
import {
  keyToBitmask,
  keysToBitmask,
  bitmaskToKeys,
  isValidKey,
  createKeyPress,
  createCombo,
} from "../src/input/keys";
import { M8Key } from "../src/state/types";

describe("Key Input", () => {
  describe("keyToBitmask", () => {
    it("should convert single keys correctly", () => {
      expect(keyToBitmask("left")).toBe(M8Key.LEFT);
      expect(keyToBitmask("up")).toBe(M8Key.UP);
      expect(keyToBitmask("down")).toBe(M8Key.DOWN);
      expect(keyToBitmask("right")).toBe(M8Key.RIGHT);
      expect(keyToBitmask("shift")).toBe(M8Key.SELECT);
      expect(keyToBitmask("start")).toBe(M8Key.START);
      expect(keyToBitmask("opt")).toBe(M8Key.OPT);
      expect(keyToBitmask("edit")).toBe(M8Key.EDIT);
    });
  });

  describe("keysToBitmask", () => {
    it("should combine multiple keys", () => {
      const bitmask = keysToBitmask(["shift", "up"]);
      expect(bitmask).toBe(M8Key.SELECT | M8Key.UP);
    });

    it("should handle empty array", () => {
      expect(keysToBitmask([])).toBe(0);
    });

    it("should handle single key", () => {
      expect(keysToBitmask(["edit"])).toBe(M8Key.EDIT);
    });
  });

  describe("bitmaskToKeys", () => {
    it("should parse bitmask to keys", () => {
      const keys = bitmaskToKeys(M8Key.SELECT | M8Key.UP);
      expect(keys).toContain("shift");
      expect(keys).toContain("up");
      expect(keys.length).toBe(2);
    });

    it("should handle zero bitmask", () => {
      expect(bitmaskToKeys(0)).toEqual([]);
    });
  });

  describe("isValidKey", () => {
    it("should validate correct keys", () => {
      expect(isValidKey("up")).toBe(true);
      expect(isValidKey("shift")).toBe(true);
      expect(isValidKey("edit")).toBe(true);
    });

    it("should reject invalid keys", () => {
      expect(isValidKey("invalid")).toBe(false);
      expect(isValidKey("")).toBe(false);
    });
  });

  describe("createKeyPress", () => {
    it("should create press and release sequence", () => {
      const seq = createKeyPress("up");
      expect(seq.length).toBe(2);
      expect(seq[0].bitmask).toBe(M8Key.UP);
      expect(seq[1].bitmask).toBe(0);
    });
  });

  describe("createCombo", () => {
    it("should create combo sequence", () => {
      const seq = createCombo("shift", "up");
      expect(seq.length).toBe(4);
      // Hold shift
      expect(seq[0].bitmask).toBe(M8Key.SELECT);
      // Press both
      expect(seq[1].bitmask).toBe(M8Key.SELECT | M8Key.UP);
      // Release up
      expect(seq[2].bitmask).toBe(M8Key.SELECT);
      // Release all
      expect(seq[3].bitmask).toBe(0);
    });
  });
});
