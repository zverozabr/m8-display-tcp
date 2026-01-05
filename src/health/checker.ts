/**
 * Health Checker
 * Checks system status and provides actionable suggestions
 * SOLID: Single Responsibility - only checks health
 */

import type { DeviceDiscovery, DiscoveryResult } from "../discovery";
import { existsSync } from "fs";

export interface CheckResult {
  ok: boolean;
  status: "healthy" | "degraded" | "unhealthy";
  message: string;
  details?: Record<string, unknown>;
}

export interface HealthReport {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  checks: {
    serial: CheckResult;
    audio: CheckResult;
    permissions: CheckResult;
    docker: CheckResult;
  };
  suggestions: string[];
}

export class HealthChecker {
  constructor(private discovery: DeviceDiscovery) {}

  async check(): Promise<HealthReport> {
    const [serial, audio, permissions, docker] = await Promise.all([
      this.checkSerial(),
      this.checkAudio(),
      this.checkPermissions(),
      this.checkDocker(),
    ]);

    const checks = { serial, audio, permissions, docker };
    const suggestions = this.generateSuggestions(checks);

    // Overall status
    const allOk = Object.values(checks).every((c) => c.ok);
    const anyFailed = Object.values(checks).some(
      (c) => c.status === "unhealthy"
    );

    return {
      status: allOk ? "healthy" : anyFailed ? "unhealthy" : "degraded",
      timestamp: new Date().toISOString(),
      checks,
      suggestions,
    };
  }

  private async checkSerial(): Promise<CheckResult> {
    const result = await this.discovery.findSerial();

    if (result.found) {
      return {
        ok: true,
        status: "healthy",
        message: `M8 found at ${result.device?.path}`,
        details: {
          path: result.device?.path,
          method: result.method,
          vendorId: result.device?.vendorId,
        },
      };
    }

    return {
      ok: false,
      status: "unhealthy",
      message: result.error || "M8 serial device not found",
      details: { availablePorts: await this.discovery.listSerialPorts() },
    };
  }

  private async checkAudio(): Promise<CheckResult> {
    const result = await this.discovery.findAudio();

    if (result.found) {
      return {
        ok: true,
        status: "healthy",
        message: `M8 audio at ${result.device?.path}`,
        details: {
          path: result.device?.path,
          description: result.device?.description,
        },
      };
    }

    return {
      ok: false,
      status: "degraded", // Audio is optional
      message: result.error || "M8 audio device not found",
      details: { availableDevices: await this.discovery.listAudioDevices() },
    };
  }

  private async checkPermissions(): Promise<CheckResult> {
    const issues: string[] = [];

    // Check serial port access
    if (existsSync("/dev/ttyACM0")) {
      try {
        const { accessSync, constants } = await import("fs");
        accessSync("/dev/ttyACM0", constants.R_OK | constants.W_OK);
      } catch {
        issues.push("No read/write access to /dev/ttyACM0");
      }
    }

    // Check audio device access
    if (existsSync("/dev/snd")) {
      try {
        const { accessSync, constants } = await import("fs");
        accessSync("/dev/snd", constants.R_OK);
      } catch {
        issues.push("No access to /dev/snd");
      }
    }

    if (issues.length === 0) {
      return {
        ok: true,
        status: "healthy",
        message: "All permissions OK",
      };
    }

    return {
      ok: false,
      status: "degraded",
      message: issues.join("; "),
      details: { issues },
    };
  }

  private async checkDocker(): Promise<CheckResult> {
    const isDocker =
      existsSync("/.dockerenv") || existsSync("/run/.containerenv");

    if (!isDocker) {
      return {
        ok: true,
        status: "healthy",
        message: "Running on host (not in container)",
      };
    }

    // In Docker - check if devices are properly mounted
    const hasDevSnd = existsSync("/dev/snd");
    const hasUdev = existsSync("/run/udev");

    if (hasDevSnd && hasUdev) {
      return {
        ok: true,
        status: "healthy",
        message: "Docker environment properly configured",
        details: { hasDevSnd, hasUdev },
      };
    }

    return {
      ok: false,
      status: "degraded",
      message: "Docker missing device mounts",
      details: { hasDevSnd, hasUdev, isDocker: true },
    };
  }

  private generateSuggestions(checks: HealthReport["checks"]): string[] {
    const suggestions: string[] = [];

    if (!checks.serial.ok) {
      suggestions.push("Connect M8 via USB cable");
      suggestions.push("Check: ls -la /dev/ttyACM*");
      if (checks.docker.details?.isDocker) {
        suggestions.push("Add to docker run: --device /dev/ttyACM0");
      }
    }

    if (!checks.audio.ok) {
      suggestions.push("Install alsa-utils: apt-get install alsa-utils");
      suggestions.push("Check: arecord -l | grep M8");
      if (checks.docker.details?.isDocker) {
        suggestions.push("Add to docker run: --device /dev/snd --group-add audio");
      }
    }

    if (!checks.permissions.ok) {
      suggestions.push("Add user to dialout group: sudo usermod -aG dialout $USER");
      suggestions.push("Add user to audio group: sudo usermod -aG audio $USER");
      suggestions.push("Then logout and login again");
    }

    if (checks.docker.details?.isDocker && !checks.docker.details?.hasUdev) {
      suggestions.push("Add to docker run: -v /run/udev:/run/udev:ro");
    }

    return suggestions;
  }
}
