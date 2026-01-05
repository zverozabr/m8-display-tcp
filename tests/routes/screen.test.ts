/**
 * Screen Routes Unit Tests (TDD)
 */

import { describe, it, expect, mock } from "bun:test";
import { createScreenRoutes } from "../../src/server/routes/screen";

describe("Screen Routes", () => {
  // Mock dependencies
  const mockBuffer = {
    toJSON: mock(() => ({
      width: 320,
      height: 240,
      cells: [{ x: 0, y: 0, char: "M" }],
    })),
    toText: mock(() => "SONG  CHAIN  PHRASE"),
  };

  const mockFramebuffer = {
    toBMP: mock(() => new Uint8Array([0x42, 0x4d, 0x00, 0x00])), // BM header
  };

  describe("getJson", () => {
    it("returns buffer as JSON", () => {
      const routes = createScreenRoutes({
        buffer: mockBuffer as any,
        framebuffer: mockFramebuffer as any,
      });

      const res = {
        writeHead: mock(() => {}),
        end: mock(() => {}),
      };

      routes.getJson(res as any);

      expect(res.writeHead).toHaveBeenCalledWith(200, {
        "Content-Type": "application/json",
      });

      const response = JSON.parse(res.end.mock.calls[0][0]);
      expect(response).toHaveProperty("width", 320);
      expect(response).toHaveProperty("height", 240);
      expect(response.cells).toBeArray();
    });
  });

  describe("getText", () => {
    it("returns buffer as plain text", () => {
      const routes = createScreenRoutes({
        buffer: mockBuffer as any,
        framebuffer: mockFramebuffer as any,
      });

      const res = {
        writeHead: mock(() => {}),
        end: mock(() => {}),
      };

      routes.getText(res as any);

      expect(res.writeHead).toHaveBeenCalledWith(200, {
        "Content-Type": "text/plain",
      });
      expect(res.end).toHaveBeenCalledWith("SONG  CHAIN  PHRASE");
    });
  });

  describe("getImage", () => {
    it("returns BMP image when framebuffer available", () => {
      const routes = createScreenRoutes({
        buffer: mockBuffer as any,
        framebuffer: mockFramebuffer as any,
      });

      const res = {
        writeHead: mock(() => {}),
        end: mock(() => {}),
      };

      routes.getImage(res as any);

      expect(res.writeHead).toHaveBeenCalledWith(200, {
        "Content-Type": "image/bmp",
        "Content-Length": 4,
        "Cache-Control": "no-cache",
      });
    });

    it("returns error when framebuffer not available", () => {
      const routes = createScreenRoutes({
        buffer: mockBuffer as any,
        framebuffer: null,
      });

      const res = {
        writeHead: mock(() => {}),
        end: mock(() => {}),
      };

      routes.getImage(res as any);

      expect(res.writeHead).toHaveBeenCalledWith(500, {
        "Content-Type": "application/json",
      });

      const response = JSON.parse(res.end.mock.calls[0][0]);
      expect(response).toHaveProperty("error", "Framebuffer not available");
    });
  });
});
