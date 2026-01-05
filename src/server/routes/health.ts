/**
 * Health Route - Single Responsibility: connection status
 */

import type { ServerResponse } from "http";
import { jsonResponse } from "../helpers";
import type { M8Connection } from "../../serial/connection";

export interface HealthDependencies {
  connection: M8Connection;
  getClientCount: () => number;
}

/**
 * Create health route handler
 * @param deps Dependencies injected (Dependency Inversion)
 */
export function createHealthRoute(deps: HealthDependencies) {
  return {
    /**
     * GET /api/health
     * Returns connection status and client count
     */
    get(res: ServerResponse): void {
      jsonResponse(res, {
        connected: deps.connection.isConnected(),
        port: deps.connection.getPort(),
        clients: deps.getClientCount(),
      });
    },
  };
}
