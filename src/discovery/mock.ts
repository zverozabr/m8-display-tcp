/**
 * Mock Device Discovery for Testing
 * SOLID: Liskov Substitution - can replace real discovery in tests
 */

import type { DeviceDiscovery, DeviceInfo, DiscoveryResult } from "./interface";

export interface MockDevices {
  serial?: DeviceInfo | null;
  audio?: { path: string; description?: string } | null;
  serialPorts?: DeviceInfo[];
  audioDevices?: string[];
}

export class MockDiscovery implements DeviceDiscovery {
  private devices: MockDevices;
  public findSerialCalls = 0;
  public findAudioCalls = 0;

  constructor(devices: MockDevices = {}) {
    this.devices = devices;
  }

  async findSerial(): Promise<DiscoveryResult> {
    this.findSerialCalls++;

    if (this.devices.serial === null) {
      return { found: false, error: "M8 serial device not found" };
    }

    if (this.devices.serial) {
      return {
        found: true,
        device: this.devices.serial,
        method: "vid_pid",
      };
    }

    return { found: false, error: "No mock serial configured" };
  }

  async findAudio(): Promise<DiscoveryResult> {
    this.findAudioCalls++;

    if (this.devices.audio === null) {
      return { found: false, error: "M8 audio device not found" };
    }

    if (this.devices.audio) {
      return {
        found: true,
        device: {
          path: this.devices.audio.path,
          description: this.devices.audio.description,
        },
        method: "vid_pid",
      };
    }

    return { found: false, error: "No mock audio configured" };
  }

  async listSerialPorts(): Promise<DeviceInfo[]> {
    return this.devices.serialPorts || [];
  }

  async listAudioDevices(): Promise<string[]> {
    return this.devices.audioDevices || [];
  }

  // Helper to update mock state during test
  setDevices(devices: Partial<MockDevices>): void {
    this.devices = { ...this.devices, ...devices };
  }

  reset(): void {
    this.findSerialCalls = 0;
    this.findAudioCalls = 0;
  }
}
