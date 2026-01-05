/**
 * Device Discovery Module
 * Re-exports all discovery components
 */

export * from "./interface";
export * from "./linux";
export * from "./mock";

import type { DeviceDiscovery } from "./interface";
import { LinuxDiscovery } from "./linux";

/**
 * Create default discovery instance for current platform
 */
export function createDiscovery(options?: {
  serialPort?: string;
  audioDevice?: string;
}): DeviceDiscovery {
  // Future: could add MacOS, Windows implementations
  return new LinuxDiscovery(options);
}
