/**
 * Health Checker Tests
 * TDD: Tests drive the implementation
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert";
import { HealthChecker } from "../../src/health";
import { MockDiscovery } from "../../src/discovery";

describe("HealthChecker", () => {
  let discovery: MockDiscovery;
  let checker: HealthChecker;

  beforeEach(() => {
    discovery = new MockDiscovery();
    checker = new HealthChecker(discovery);
  });

  describe("check()", () => {
    it("returns healthy when all devices found", async () => {
      discovery = new MockDiscovery({
        serial: { path: "/dev/ttyACM0", vendorId: "16c0" },
        audio: { path: "hw:2", description: "M8 USB Audio" },
      });
      checker = new HealthChecker(discovery);

      const report = await checker.check();

      assert.strictEqual(report.checks.serial.ok, true);
      assert.strictEqual(report.checks.audio.ok, true);
      assert.ok(report.timestamp);
    });

    it("returns unhealthy when serial not found", async () => {
      discovery = new MockDiscovery({
        serial: null,
        audio: { path: "hw:2" },
      });
      checker = new HealthChecker(discovery);

      const report = await checker.check();

      assert.strictEqual(report.checks.serial.ok, false);
      assert.strictEqual(report.checks.serial.status, "unhealthy");
    });

    it("returns degraded when audio not found", async () => {
      discovery = new MockDiscovery({
        serial: { path: "/dev/ttyACM0" },
        audio: null,
      });
      checker = new HealthChecker(discovery);

      const report = await checker.check();

      assert.strictEqual(report.checks.audio.ok, false);
      assert.strictEqual(report.checks.audio.status, "degraded");
    });

    it("includes device path in serial check", async () => {
      discovery = new MockDiscovery({
        serial: { path: "/dev/ttyACM0", vendorId: "16c0" },
      });
      checker = new HealthChecker(discovery);

      const report = await checker.check();

      assert.strictEqual(report.checks.serial.details?.path, "/dev/ttyACM0");
      assert.strictEqual(report.checks.serial.details?.vendorId, "16c0");
    });

    it("includes timestamp in ISO format", async () => {
      const report = await checker.check();

      assert.ok(report.timestamp.match(/^\d{4}-\d{2}-\d{2}T/));
    });
  });

  describe("suggestions", () => {
    it("suggests connecting M8 when serial not found", async () => {
      discovery = new MockDiscovery({ serial: null });
      checker = new HealthChecker(discovery);

      const report = await checker.check();

      assert.ok(report.suggestions.some((s) => s.includes("Connect M8")));
    });

    it("suggests installing alsa-utils when audio not found", async () => {
      discovery = new MockDiscovery({
        serial: { path: "/dev/ttyACM0" },
        audio: null,
      });
      checker = new HealthChecker(discovery);

      const report = await checker.check();

      assert.ok(report.suggestions.some((s) => s.includes("alsa-utils")));
    });

    it("returns empty suggestions when all healthy", async () => {
      discovery = new MockDiscovery({
        serial: { path: "/dev/ttyACM0" },
        audio: { path: "hw:2" },
      });
      checker = new HealthChecker(discovery);

      const report = await checker.check();

      // May still have suggestions for permissions/docker
      // but serial and audio suggestions should be absent
      assert.ok(!report.suggestions.some((s) => s.includes("Connect M8")));
      assert.ok(!report.suggestions.some((s) => s.includes("alsa-utils")));
    });
  });

  describe("overall status", () => {
    it("is healthy when serial and audio found", async () => {
      discovery = new MockDiscovery({
        serial: { path: "/dev/ttyACM0" },
        audio: { path: "hw:2" },
      });
      checker = new HealthChecker(discovery);

      const report = await checker.check();

      // May be degraded due to permissions/docker checks
      // but should not be unhealthy
      assert.notStrictEqual(report.status, "unhealthy");
    });

    it("is unhealthy when serial not found", async () => {
      discovery = new MockDiscovery({ serial: null });
      checker = new HealthChecker(discovery);

      const report = await checker.check();

      assert.strictEqual(report.status, "unhealthy");
    });
  });

  describe("CheckResult structure", () => {
    it("serial check has required fields", async () => {
      discovery = new MockDiscovery({
        serial: { path: "/dev/ttyACM0" },
      });
      checker = new HealthChecker(discovery);

      const report = await checker.check();
      const serial = report.checks.serial;

      assert.ok("ok" in serial);
      assert.ok("status" in serial);
      assert.ok("message" in serial);
      assert.ok(["healthy", "degraded", "unhealthy"].includes(serial.status));
    });

    it("audio check has required fields", async () => {
      discovery = new MockDiscovery({
        audio: { path: "hw:2" },
      });
      checker = new HealthChecker(discovery);

      const report = await checker.check();
      const audio = report.checks.audio;

      assert.ok("ok" in audio);
      assert.ok("status" in audio);
      assert.ok("message" in audio);
    });
  });

  describe("HealthReport structure", () => {
    it("has all required checks", async () => {
      const report = await checker.check();

      assert.ok("serial" in report.checks);
      assert.ok("audio" in report.checks);
      assert.ok("permissions" in report.checks);
      assert.ok("docker" in report.checks);
    });

    it("has suggestions array", async () => {
      const report = await checker.check();

      assert.ok(Array.isArray(report.suggestions));
    });

    it("has valid status", async () => {
      const report = await checker.check();

      assert.ok(["healthy", "degraded", "unhealthy"].includes(report.status));
    });
  });
});

describe("HealthChecker with MockDiscovery", () => {
  it("uses injected discovery (DI pattern)", async () => {
    const discovery = new MockDiscovery({
      serial: { path: "/test/path" },
    });
    const checker = new HealthChecker(discovery);

    await checker.check();

    assert.strictEqual(discovery.findSerialCalls, 1);
    assert.strictEqual(discovery.findAudioCalls, 1);
  });

  it("can be tested without real hardware", async () => {
    // This test proves we can test without M8 connected
    const discovery = new MockDiscovery({
      serial: { path: "/dev/ttyACM0", vendorId: "16c0", productId: "048a" },
      audio: { path: "hw:2", description: "DirtyWave M8" },
    });
    const checker = new HealthChecker(discovery);

    const report = await checker.check();

    assert.strictEqual(report.checks.serial.ok, true);
    assert.strictEqual(report.checks.audio.ok, true);
    assert.ok(report.checks.serial.message.includes("/dev/ttyACM0"));
  });
});
