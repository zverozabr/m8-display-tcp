/**
 * Linux Device Discovery
 * Handles both native Linux and Docker environments
 */

import { SerialPort } from "serialport";
import { spawn } from "child_process";
import type { DeviceDiscovery, DeviceInfo, DiscoveryResult } from "./interface";
import { M8_VENDOR_ID, M8_PRODUCT_IDS, M8_AUDIO_NAMES } from "./interface";

export class LinuxDiscovery implements DeviceDiscovery {
  private envSerialPort?: string;
  private envAudioDevice?: string;

  constructor(options?: { serialPort?: string; audioDevice?: string }) {
    this.envSerialPort = options?.serialPort || process.env.M8_SERIAL_PORT;
    this.envAudioDevice = options?.audioDevice || process.env.M8_AUDIO_DEVICE;
  }

  async findSerial(): Promise<DiscoveryResult> {
    // 1. Check ENV/config first (explicit > magic)
    if (this.envSerialPort) {
      return {
        found: true,
        device: { path: this.envSerialPort },
        method: "env",
      };
    }

    const ports = await this.listSerialPorts();

    // 2. Try VID:PID match (works on host with udev)
    for (const port of ports) {
      if (this.isM8ByVidPid(port)) {
        return {
          found: true,
          device: port,
          method: "vid_pid",
        };
      }
    }

    // 3. Fallback for Docker (no udev metadata)
    const acmPort = ports.find((p) => p.path === "/dev/ttyACM0" && !p.vendorId);
    if (acmPort) {
      return {
        found: true,
        device: acmPort,
        method: "path_fallback",
      };
    }

    return {
      found: false,
      error: "M8 serial device not found",
    };
  }

  async findAudio(): Promise<DiscoveryResult> {
    // 1. Check ENV/config first
    if (this.envAudioDevice) {
      return {
        found: true,
        device: { path: this.envAudioDevice },
        method: "env",
      };
    }

    // 2. Use arecord -l to find M8 audio
    const devices = await this.listAudioDevices();

    for (const device of devices) {
      for (const name of M8_AUDIO_NAMES) {
        if (device.includes(name)) {
          // Extract card number from "card 2: M8 [M8]..."
          const match = device.match(/card (\d+):/);
          if (match) {
            return {
              found: true,
              device: { path: `hw:${match[1]}`, description: device },
              method: "vid_pid",
            };
          }
        }
      }
    }

    return {
      found: false,
      error: "M8 audio device not found. Is alsa-utils installed?",
    };
  }

  async listSerialPorts(): Promise<DeviceInfo[]> {
    const ports = await SerialPort.list();
    return ports.map((p) => ({
      path: p.path,
      vendorId: p.vendorId,
      productId: p.productId,
      manufacturer: p.manufacturer,
    }));
  }

  async listAudioDevices(): Promise<string[]> {
    return new Promise((resolve) => {
      const proc = spawn("arecord", ["-l"]);
      let output = "";

      const timeout = setTimeout(() => {
        proc.kill("SIGKILL");
        resolve([]);
      }, 5000);

      proc.stdout.on("data", (data) => {
        output += data.toString();
      });

      proc.stderr.on("data", () => {
        // Ignore stderr
      });

      proc.on("error", () => {
        clearTimeout(timeout);
        resolve([]);
      });

      proc.on("close", () => {
        clearTimeout(timeout);
        resolve(output.split("\n").filter((l) => l.includes("card")));
      });
    });
  }

  private isM8ByVidPid(port: DeviceInfo): boolean {
    return (
      port.vendorId === M8_VENDOR_ID &&
      M8_PRODUCT_IDS.includes(port.productId || "")
    );
  }
}
