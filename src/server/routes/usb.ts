/**
 * USB Reset Routes - Single Responsibility: USB reset operations
 * DRY: Route table pattern instead of repeated if-blocks
 */

import type { IncomingMessage, ServerResponse } from "http";
import { jsonResponse, parseBody } from "../helpers";
import {
  resetM8Usb,
  resetLevel1,
  resetLevel2,
  resetLevel3,
  resetLevel4_D3cold,
  resetLevel5_MultiCycle,
  resetLevel6_RuntimePM,
  forceHardReset,
  resetAllControllers,
  ultimateReset,
  getM8UsbInfo,
  type ResetResult,
} from "../../usb/reset";

/**
 * USB route configuration
 */
interface UsbRouteConfig {
  description: string;
  handler: (body: Record<string, unknown>) => Promise<ResetResult>;
}

/**
 * Route table - single source of truth for USB endpoints
 */
const USB_ROUTES: Record<string, UsbRouteConfig> = {
  "reset": {
    description: "Auto-escalating reset (levels 1→2→3)",
    handler: async () => resetM8Usb(1, 3),
  },
  "reset/1": {
    description: "Level 1 (soft, authorized only)",
    handler: async () => resetLevel1(1000),
  },
  "reset/2": {
    description: "Level 2 (remove + rescan)",
    handler: async () => resetLevel2(2000),
  },
  "reset/3": {
    description: "Level 3 (xhci unbind/rebind)",
    handler: async () => resetLevel3(5000),
  },
  "reset/force": {
    description: "Force hard reset with delay",
    handler: async (body) => forceHardReset(Number(body.delayMs) || 10000),
  },
  "reset/nuclear": {
    description: "Reset ALL USB controllers",
    handler: async (body) => resetAllControllers(Number(body.delayMs) || 15000),
  },
  "reset/d3cold": {
    description: "Level 4: PCI D3cold state",
    handler: async (body) => resetLevel4_D3cold(Number(body.delayMs) || 60000),
  },
  "reset/multi": {
    description: "Level 5: Multiple cycles",
    handler: async (body) => resetLevel5_MultiCycle(
      Number(body.cycles) || 3,
      Number(body.delayMs) || 30000
    ),
  },
  "reset/pm": {
    description: "Level 6: Runtime PM manipulation",
    handler: async (body) => resetLevel6_RuntimePM(Number(body.delayMs) || 10000),
  },
  "reset/ultimate": {
    description: "Try EVERYTHING (last resort)",
    handler: async () => ultimateReset(),
  },
};

/**
 * Create USB route handlers
 */
export function createUsbRoutes() {
  return {
    /**
     * GET /api/usb/info - Get M8 USB device info
     */
    async getInfo(res: ServerResponse): Promise<void> {
      const info = await getM8UsbInfo();
      jsonResponse(res, info || { error: "M8 not found" }, info ? 200 : 404);
    },

    /**
     * Handle USB reset routes
     * @returns true if route was handled, false otherwise
     */
    async handleReset(
      req: IncomingMessage,
      res: ServerResponse,
      path: string
    ): Promise<boolean> {
      // Remove "usb/" prefix to match route table
      const routeKey = path.replace("usb/", "");
      const route = USB_ROUTES[routeKey];

      if (!route) {
        return false; // Not a USB reset route
      }

      // Parse body for routes that need parameters
      const body = await parseBody<Record<string, unknown>>(req);
      const result = await route.handler(body);
      jsonResponse(res, result, result.success ? 200 : 500);
      return true;
    },

    /**
     * Get available USB routes (for documentation)
     */
    getRoutes(): Record<string, string> {
      return Object.fromEntries(
        Object.entries(USB_ROUTES).map(([key, config]) => [
          `/api/usb/${key}`,
          config.description,
        ])
      );
    },
  };
}
