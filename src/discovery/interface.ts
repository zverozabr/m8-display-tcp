/**
 * Device Discovery Interface
 * SOLID: Single Responsibility - only discovers devices
 * SOLID: Dependency Inversion - high-level modules depend on abstraction
 */

export interface DeviceInfo {
  path: string;
  vendorId?: string;
  productId?: string;
  manufacturer?: string;
  description?: string;
}

export interface DiscoveryResult {
  found: boolean;
  device?: DeviceInfo;
  error?: string;
  method?: "vid_pid" | "path_fallback" | "env" | "config";
}

export interface DeviceDiscovery {
  /**
   * Find M8 serial device
   */
  findSerial(): Promise<DiscoveryResult>;

  /**
   * Find M8 audio device (ALSA)
   */
  findAudio(): Promise<DiscoveryResult>;

  /**
   * List all available serial ports
   */
  listSerialPorts(): Promise<DeviceInfo[]>;

  /**
   * List all available audio devices
   */
  listAudioDevices(): Promise<string[]>;
}

// M8 Teensy identifiers
export const M8_VENDOR_ID = "16c0";
export const M8_PRODUCT_IDS = ["048a", "048b"];
export const M8_AUDIO_NAMES = ["M8", "Teensy", "DirtyWave"];
