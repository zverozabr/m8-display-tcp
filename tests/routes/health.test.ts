/**
 * Health Route Unit Tests (TDD)
 */

import { describe, it, expect, mock } from "bun:test";
import { createHealthRoute } from "../../src/server/routes/health";

describe("Health Route", () => {
  // Mock dependencies
  const mockConnection = {
    isConnected: mock(() => true),
    getPort: mock(() => "/dev/ttyACM0"),
  };

  const mockGetClientCount = mock(() => 3);

  const healthRoute = createHealthRoute({
    connection: mockConnection as any,
    getClientCount: mockGetClientCount,
  });

  it("returns connection status", () => {
    const res = {
      writeHead: mock(() => {}),
      end: mock(() => {}),
    };

    healthRoute.get(res as any);

    expect(res.writeHead).toHaveBeenCalledWith(200, {
      "Content-Type": "application/json",
    });

    const response = JSON.parse(res.end.mock.calls[0][0]);
    expect(response).toHaveProperty("connected", true);
    expect(response).toHaveProperty("port", "/dev/ttyACM0");
    expect(response).toHaveProperty("clients", 3);
  });

  it("returns disconnected status when not connected", () => {
    const disconnectedMock = {
      isConnected: mock(() => false),
      getPort: mock(() => ""),
    };

    const route = createHealthRoute({
      connection: disconnectedMock as any,
      getClientCount: mock(() => 0),
    });

    const res = {
      writeHead: mock(() => {}),
      end: mock(() => {}),
    };

    route.get(res as any);

    const response = JSON.parse(res.end.mock.calls[0][0]);
    expect(response.connected).toBe(false);
    expect(response.port).toBe("");
    expect(response.clients).toBe(0);
  });
});
