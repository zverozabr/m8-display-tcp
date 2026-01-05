/**
 * Device Discovery Tests
 * TDD: Tests define expected behavior
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert";
import {
  MockDiscovery,
  M8_VENDOR_ID,
  M8_PRODUCT_IDS,
  DeviceInfo,
} from "../../src/discovery";

describe("DeviceDiscovery", () => {
  describe("MockDiscovery", () => {
    let discovery: MockDiscovery;

    beforeEach(() => {
      discovery = new MockDiscovery();
    });

    describe("findSerial", () => {
      it("returns not found when no devices configured", async () => {
        const result = await discovery.findSerial();
        assert.strictEqual(result.found, false);
        assert.ok(result.error);
      });

      it("returns device when serial is configured", async () => {
        discovery = new MockDiscovery({
          serial: { path: "/dev/ttyACM0", vendorId: M8_VENDOR_ID },
        });

        const result = await discovery.findSerial();
        assert.strictEqual(result.found, true);
        assert.strictEqual(result.device?.path, "/dev/ttyACM0");
      });

      it("returns not found when serial is explicitly null", async () => {
        discovery = new MockDiscovery({ serial: null });

        const result = await discovery.findSerial();
        assert.strictEqual(result.found, false);
        assert.strictEqual(result.error, "M8 serial device not found");
      });

      it("tracks call count", async () => {
        assert.strictEqual(discovery.findSerialCalls, 0);
        await discovery.findSerial();
        assert.strictEqual(discovery.findSerialCalls, 1);
        await discovery.findSerial();
        assert.strictEqual(discovery.findSerialCalls, 2);
      });
    });

    describe("findAudio", () => {
      it("returns not found when no devices configured", async () => {
        const result = await discovery.findAudio();
        assert.strictEqual(result.found, false);
      });

      it("returns device when audio is configured", async () => {
        discovery = new MockDiscovery({
          audio: { path: "hw:2", description: "M8 USB Audio" },
        });

        const result = await discovery.findAudio();
        assert.strictEqual(result.found, true);
        assert.strictEqual(result.device?.path, "hw:2");
      });

      it("returns not found when audio is explicitly null", async () => {
        discovery = new MockDiscovery({ audio: null });

        const result = await discovery.findAudio();
        assert.strictEqual(result.found, false);
      });
    });

    describe("listSerialPorts", () => {
      it("returns empty array by default", async () => {
        const ports = await discovery.listSerialPorts();
        assert.deepStrictEqual(ports, []);
      });

      it("returns configured ports", async () => {
        const mockPorts: DeviceInfo[] = [
          { path: "/dev/ttyACM0", vendorId: M8_VENDOR_ID, productId: M8_PRODUCT_IDS[0] },
          { path: "/dev/ttyUSB0" },
        ];
        discovery = new MockDiscovery({ serialPorts: mockPorts });

        const ports = await discovery.listSerialPorts();
        assert.strictEqual(ports.length, 2);
        assert.strictEqual(ports[0].vendorId, M8_VENDOR_ID);
      });
    });

    describe("listAudioDevices", () => {
      it("returns empty array by default", async () => {
        const devices = await discovery.listAudioDevices();
        assert.deepStrictEqual(devices, []);
      });

      it("returns configured devices", async () => {
        discovery = new MockDiscovery({
          audioDevices: [
            "card 0: Generic [HD-Audio Generic]",
            "card 2: M8 [M8], device 0: USB Audio",
          ],
        });

        const devices = await discovery.listAudioDevices();
        assert.strictEqual(devices.length, 2);
        assert.ok(devices[1].includes("M8"));
      });
    });

    describe("setDevices", () => {
      it("updates mock state", async () => {
        let result = await discovery.findSerial();
        assert.strictEqual(result.found, false);

        discovery.setDevices({
          serial: { path: "/dev/ttyACM0" },
        });

        result = await discovery.findSerial();
        assert.strictEqual(result.found, true);
      });
    });

    describe("reset", () => {
      it("resets call counters", async () => {
        await discovery.findSerial();
        await discovery.findAudio();
        assert.strictEqual(discovery.findSerialCalls, 1);
        assert.strictEqual(discovery.findAudioCalls, 1);

        discovery.reset();
        assert.strictEqual(discovery.findSerialCalls, 0);
        assert.strictEqual(discovery.findAudioCalls, 0);
      });
    });
  });

  describe("DiscoveryResult", () => {
    it("includes method when device found", async () => {
      const discovery = new MockDiscovery({
        serial: { path: "/dev/ttyACM0" },
      });

      const result = await discovery.findSerial();
      assert.strictEqual(result.found, true);
      assert.strictEqual(result.method, "vid_pid");
    });

    it("includes error when device not found", async () => {
      const discovery = new MockDiscovery({ serial: null });

      const result = await discovery.findSerial();
      assert.strictEqual(result.found, false);
      assert.ok(result.error);
      assert.strictEqual(result.method, undefined);
    });
  });
});

describe("M8 Constants", () => {
  it("defines correct vendor ID", () => {
    assert.strictEqual(M8_VENDOR_ID, "16c0");
  });

  it("defines valid product IDs", () => {
    assert.ok(M8_PRODUCT_IDS.includes("048a"));
    assert.ok(M8_PRODUCT_IDS.includes("048b"));
  });
});
