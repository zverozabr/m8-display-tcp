/**
 * Screen Routes - Single Responsibility: display buffer access
 */

import type { ServerResponse } from "http";
import { jsonResponse } from "../helpers";
import type { TextBuffer } from "../../display/buffer";
import type { Framebuffer } from "../../display/framebuffer";

export interface ScreenDependencies {
  buffer: TextBuffer;
  framebuffer: Framebuffer | null;
}

/**
 * Create screen route handlers
 * @param deps Dependencies injected (Dependency Inversion)
 */
export function createScreenRoutes(deps: ScreenDependencies) {
  return {
    /**
     * GET /api/screen
     * Returns screen buffer as JSON
     */
    getJson(res: ServerResponse): void {
      jsonResponse(res, deps.buffer.toJSON());
    },

    /**
     * GET /api/screen/text
     * Returns screen buffer as plain text
     */
    getText(res: ServerResponse): void {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end(deps.buffer.toText());
    },

    /**
     * GET /api/screen/image
     * Returns screen as BMP image
     */
    getImage(res: ServerResponse): void {
      if (!deps.framebuffer) {
        jsonResponse(res, { error: "Framebuffer not available" }, 500);
        return;
      }
      const bmp = deps.framebuffer.toBMP();
      res.writeHead(200, {
        "Content-Type": "image/bmp",
        "Content-Length": bmp.length,
        "Cache-Control": "no-cache",
      });
      res.end(Buffer.from(bmp));
    },
  };
}
