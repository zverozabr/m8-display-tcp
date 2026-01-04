/**
 * M8 USB Device Reset - Multi-Level Recovery
 *
 * Level 1: authorized 0/1 (soft - doesn't cut VBUS power)
 * Level 2: USB remove + rescan (medium - re-enumerates device)
 * Level 3: xhci_hcd unbind/rebind (hard - restarts entire USB controller)
 */

import { exec } from "child_process";
import { promisify } from "util";
import { readFile, writeFile, readdir, access } from "fs/promises";

const execAsync = promisify(exec);

const M8_VENDOR_ID = "16c0";
const M8_PRODUCT_ID = "048a";

export type ResetLevel = 1 | 2 | 3;

export interface ResetResult {
  success: boolean;
  level: ResetLevel;
  message: string;
  deviceFound?: boolean;
}

/**
 * Find M8 USB device path in sysfs
 */
export async function findM8UsbPath(): Promise<string | null> {
  try {
    const devices = await readdir("/sys/bus/usb/devices");

    for (const device of devices) {
      // Skip interfaces (contain ':')
      if (device.includes(":")) continue;

      const basePath = `/sys/bus/usb/devices/${device}`;

      try {
        const vendor = (await readFile(`${basePath}/idVendor`, "utf-8")).trim();
        const product = (await readFile(`${basePath}/idProduct`, "utf-8")).trim();

        if (vendor === M8_VENDOR_ID && product === M8_PRODUCT_ID) {
          return basePath;
        }
      } catch {
        // Not a USB device with vendor/product, skip
      }
    }
  } catch (err) {
    console.error("Error scanning USB devices:", err);
  }

  return null;
}

/**
 * Get USB bus number for M8 device (e.g., "3" for Bus 003)
 */
async function getM8BusNumber(): Promise<string | null> {
  const path = await findM8UsbPath();
  if (!path) return null;

  // Path like /sys/bus/usb/devices/3-1 → bus = 3
  const match = path.match(/\/(\d+)-/);
  return match ? match[1] : null;
}

/**
 * Find PCI address for USB controller handling M8's bus
 */
async function getUsbControllerPciAddress(): Promise<string | null> {
  const busNum = await getM8BusNumber();
  if (!busNum) {
    // If M8 not found, try all possible buses (1-4)
    for (const bus of ["1", "2", "3", "4"]) {
      try {
        const uevent = await readFile(`/sys/bus/usb/devices/usb${bus}/../uevent`, "utf-8");
        const match = uevent.match(/PCI_SLOT_NAME=(.+)/);
        if (match) {
          console.log(`Found USB controller for bus ${bus}: ${match[1]}`);
          return match[1];
        }
      } catch {
        // Bus doesn't exist
      }
    }
    return null;
  }

  try {
    const uevent = await readFile(`/sys/bus/usb/devices/usb${busNum}/../uevent`, "utf-8");
    const match = uevent.match(/PCI_SLOT_NAME=(.+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

/**
 * Check if file exists and is writable
 */
async function canWrite(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Level 1: Soft reset via authorized file
 * Quick but doesn't cut VBUS power - device still gets 5V
 */
export async function resetLevel1(delayMs = 1000): Promise<ResetResult> {
  const path = await findM8UsbPath();
  if (!path) {
    return { success: false, level: 1, message: "M8 USB device not found", deviceFound: false };
  }

  const authFile = `${path}/authorized`;

  try {
    await writeFile(authFile, "0");
    console.log("L1: M8 USB authorized=0");

    await new Promise((r) => setTimeout(r, delayMs));

    await writeFile(authFile, "1");
    console.log("L1: M8 USB authorized=1");

    await new Promise((r) => setTimeout(r, 2000));

    return { success: true, level: 1, message: "Soft reset complete", deviceFound: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return { success: false, level: 1, message: `Soft reset failed: ${msg}`, deviceFound: true };
  }
}

/**
 * Level 2: Remove device and trigger rescan
 * Forces kernel to re-enumerate the USB device
 */
export async function resetLevel2(delayMs = 2000): Promise<ResetResult> {
  const path = await findM8UsbPath();
  const busNum = await getM8BusNumber();

  // If device exists, remove it first
  if (path) {
    try {
      const removeFile = `${path}/remove`;
      if (await canWrite(removeFile)) {
        await writeFile(removeFile, "1");
        console.log("L2: Removed M8 device");
      }
    } catch (err) {
      console.log("L2: Could not remove device (may be stuck)");
    }
  }

  await new Promise((r) => setTimeout(r, delayMs));

  // Trigger USB rescan on all buses
  for (const bus of ["1", "2", "3", "4"]) {
    try {
      const scanFile = `/sys/bus/usb/devices/usb${bus}/authorized_default`;
      // Toggle to force rescan
      await writeFile(scanFile, "0");
      await new Promise((r) => setTimeout(r, 100));
      await writeFile(scanFile, "1");
      console.log(`L2: Triggered rescan on bus ${bus}`);
    } catch {
      // Bus doesn't exist or not writable
    }
  }

  await new Promise((r) => setTimeout(r, 3000));

  // Check if device came back
  const newPath = await findM8UsbPath();
  if (newPath) {
    return { success: true, level: 2, message: "Device re-enumerated", deviceFound: true };
  }

  return { success: false, level: 2, message: "Device did not return after rescan", deviceFound: false };
}

/**
 * Level 3: Hard reset - unbind/rebind xHCI controller
 * This completely restarts the USB controller, cutting power to all devices on that bus
 */
export async function resetLevel3(delayMs = 5000): Promise<ResetResult> {
  // Find controller - try from M8 device or scan all
  let pciAddr = await getUsbControllerPciAddress();

  if (!pciAddr) {
    // Fallback: try common AMD Raven controllers
    const candidates = ["0000:04:00.3", "0000:04:00.4"];
    for (const addr of candidates) {
      const bindPath = `/sys/bus/pci/drivers/xhci_hcd/${addr}`;
      try {
        await access(bindPath);
        pciAddr = addr;
        console.log(`L3: Using fallback controller ${addr}`);
        break;
      } catch {
        // Not found
      }
    }
  }

  if (!pciAddr) {
    return { success: false, level: 3, message: "Could not find USB controller", deviceFound: false };
  }

  const unbindPath = "/sys/bus/pci/drivers/xhci_hcd/unbind";
  const bindPath = "/sys/bus/pci/drivers/xhci_hcd/bind";

  try {
    console.log(`L3: Unbinding xHCI controller ${pciAddr}...`);
    await writeFile(unbindPath, pciAddr);
    console.log(`L3: Controller unbound (USB power OFF)`);

    await new Promise((r) => setTimeout(r, delayMs));

    console.log(`L3: Rebinding xHCI controller ${pciAddr}...`);
    await writeFile(bindPath, pciAddr);
    console.log(`L3: Controller rebound (USB power ON)`);

    // Wait for full enumeration
    await new Promise((r) => setTimeout(r, 5000));

    // Check if device came back
    const newPath = await findM8UsbPath();
    if (newPath) {
      return { success: true, level: 3, message: `Controller ${pciAddr} reset, device found`, deviceFound: true };
    }

    return { success: false, level: 3, message: `Controller reset but device not found`, deviceFound: false };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return { success: false, level: 3, message: `Controller reset failed: ${msg}`, deviceFound: false };
  }
}

/**
 * Auto-escalating reset: try each level until success
 */
export async function resetM8Usb(startLevel: ResetLevel = 1, maxLevel: ResetLevel = 3): Promise<ResetResult> {
  console.log(`Starting M8 USB reset (levels ${startLevel}-${maxLevel})...`);

  for (let level = startLevel; level <= maxLevel; level++) {
    console.log(`\n=== Trying Level ${level} reset ===`);

    let result: ResetResult;

    switch (level as ResetLevel) {
      case 1:
        result = await resetLevel1(1000);
        break;
      case 2:
        result = await resetLevel2(2000);
        break;
      case 3:
        result = await resetLevel3(5000);
        break;
      default:
        result = { success: false, level: level as ResetLevel, message: "Invalid level" };
    }

    console.log(`Level ${level} result: ${result.success ? "SUCCESS" : "FAILED"} - ${result.message}`);

    if (result.success && result.deviceFound) {
      return result;
    }

    // If device was found but still not working, try next level
    if (!result.deviceFound && level < maxLevel) {
      console.log(`Device not found, escalating to level ${level + 1}...`);
    }
  }

  return { success: false, level: maxLevel, message: "All reset levels failed", deviceFound: false };
}

/**
 * Force hard reset (Level 3 only) - for stuck devices
 */
export async function forceHardReset(delayMs = 10000): Promise<ResetResult> {
  console.log(`Force hard reset with ${delayMs}ms power-off delay...`);
  return resetLevel3(delayMs);
}

/**
 * Nuclear option: Reset ALL USB controllers with long delay
 * This is the most aggressive reset possible without physical unplug
 * Note: Will disconnect ALL USB devices (keyboard, mouse, etc.)
 */
export async function resetAllControllers(delayMs = 15000): Promise<ResetResult> {
  console.log(`NUCLEAR RESET: All USB controllers, ${delayMs}ms delay...`);

  const controllers = ["0000:04:00.3", "0000:04:00.4"];
  const unbindPath = "/sys/bus/pci/drivers/xhci_hcd/unbind";
  const bindPath = "/sys/bus/pci/drivers/xhci_hcd/bind";

  const unbound: string[] = [];

  // Unbind all controllers
  for (const pciAddr of controllers) {
    try {
      await writeFile(unbindPath, pciAddr);
      console.log(`Unbound ${pciAddr}`);
      unbound.push(pciAddr);
    } catch (err) {
      console.log(`Could not unbind ${pciAddr}`);
    }
  }

  if (unbound.length === 0) {
    return { success: false, level: 3, message: "Could not unbind any controllers", deviceFound: false };
  }

  console.log(`USB power OFF for ${delayMs}ms...`);
  await new Promise((r) => setTimeout(r, delayMs));

  // Rebind all controllers
  for (const pciAddr of unbound) {
    try {
      await writeFile(bindPath, pciAddr);
      console.log(`Rebound ${pciAddr}`);
    } catch (err) {
      console.log(`Could not rebind ${pciAddr}`);
    }
  }

  console.log("Waiting for enumeration (10s)...");
  await new Promise((r) => setTimeout(r, 10000));

  const newPath = await findM8UsbPath();
  if (newPath) {
    return { success: true, level: 3, message: `All controllers reset, M8 found at ${newPath}`, deviceFound: true };
  }

  return { success: false, level: 3, message: "All controllers reset but M8 not found", deviceFound: false };
}

// ============================================================================
// NEW LEVELS: Deep recovery techniques
// ============================================================================

/**
 * Level 4: PCI D3cold State - Remove PCI device and rescan
 * This forces the PCI device into the deepest power state (D3cold)
 * which may actually cut VBUS power on some systems
 */
export async function resetLevel4_D3cold(delayMs = 60000): Promise<ResetResult> {
  console.log(`L4: PCI D3cold reset with ${delayMs}ms delay...`);

  // Try both controllers (M8 is usually on 04:00.4, but try both)
  const controllers = ["0000:04:00.4", "0000:04:00.3"];

  for (const pciAddr of controllers) {
    const pciPath = `/sys/bus/pci/devices/${pciAddr}`;

    try {
      // Check if device exists
      await access(pciPath);

      // Enable runtime PM and D3cold
      try {
        await writeFile(`${pciPath}/power/control`, "auto");
        console.log(`L4: Set ${pciAddr} power control to auto`);
      } catch {
        console.log(`L4: Could not set power control for ${pciAddr}`);
      }

      // Remove PCI device - this triggers D3cold
      console.log(`L4: Removing PCI device ${pciAddr}...`);
      await writeFile(`${pciPath}/remove`, "1");
      console.log(`L4: PCI device removed (should enter D3cold)`);

    } catch (err) {
      console.log(`L4: Could not remove ${pciAddr}: ${err}`);
    }
  }

  // Wait for power to drain
  console.log(`L4: Waiting ${delayMs}ms for power drain...`);
  await new Promise((r) => setTimeout(r, delayMs));

  // Rescan PCI bus to bring devices back
  console.log("L4: Rescanning PCI bus...");
  try {
    await writeFile("/sys/bus/pci/rescan", "1");
  } catch (err) {
    console.log(`L4: PCI rescan failed: ${err}`);
    return { success: false, level: 3, message: "PCI rescan failed", deviceFound: false };
  }

  // Wait for USB enumeration
  console.log("L4: Waiting for USB enumeration (10s)...");
  await new Promise((r) => setTimeout(r, 10000));

  // Check if M8 came back
  const newPath = await findM8UsbPath();
  if (newPath) {
    return { success: true, level: 3, message: `D3cold reset successful, M8 at ${newPath}`, deviceFound: true };
  }

  return { success: false, level: 3, message: "D3cold reset complete but M8 not found", deviceFound: false };
}

/**
 * Level 5: Multiple cycles with long delays
 * Try the nuclear reset multiple times with extended delays
 */
export async function resetLevel5_MultiCycle(cycles = 3, delayMs = 30000): Promise<ResetResult> {
  console.log(`L5: Multi-cycle reset (${cycles} cycles, ${delayMs}ms each)...`);

  for (let i = 0; i < cycles; i++) {
    console.log(`\nL5: Cycle ${i + 1}/${cycles}`);

    // Try D3cold first (more aggressive)
    const d3Result = await resetLevel4_D3cold(delayMs);
    if (d3Result.success && d3Result.deviceFound) {
      console.log(`L5: Success on cycle ${i + 1} with D3cold!`);
      return { ...d3Result, message: `Multi-cycle success on attempt ${i + 1}` };
    }

    // Fall back to controller reset
    const ctrlResult = await resetAllControllers(delayMs);
    if (ctrlResult.success && ctrlResult.deviceFound) {
      console.log(`L5: Success on cycle ${i + 1} with controller reset!`);
      return { ...ctrlResult, message: `Multi-cycle success on attempt ${i + 1}` };
    }

    // Increase delay for next cycle
    const nextDelay = Math.min(delayMs * 1.5, 60000);
    console.log(`L5: Cycle ${i + 1} failed, next delay: ${nextDelay}ms`);
  }

  return { success: false, level: 3, message: `All ${cycles} cycles failed`, deviceFound: false };
}

/**
 * Level 6: Runtime PM manipulation
 * Force the controller into suspend then wake it
 */
export async function resetLevel6_RuntimePM(delayMs = 10000): Promise<ResetResult> {
  console.log(`L6: Runtime PM reset with ${delayMs}ms delay...`);

  const controllers = ["0000:04:00.3", "0000:04:00.4"];

  for (const pciAddr of controllers) {
    const powerPath = `/sys/bus/pci/devices/${pciAddr}/power`;

    try {
      // Force controller into suspend
      await writeFile(`${powerPath}/control`, "auto");
      await writeFile(`${powerPath}/autosuspend_delay_ms`, "0");
      console.log(`L6: Set ${pciAddr} to auto-suspend`);
    } catch (err) {
      console.log(`L6: Could not configure ${pciAddr}: ${err}`);
    }
  }

  // Wait for suspend to take effect
  console.log(`L6: Waiting ${delayMs}ms for suspend...`);
  await new Promise((r) => setTimeout(r, delayMs));

  // Wake up controllers
  for (const pciAddr of controllers) {
    const powerPath = `/sys/bus/pci/devices/${pciAddr}/power`;

    try {
      await writeFile(`${powerPath}/control`, "on");
      await writeFile(`${powerPath}/autosuspend_delay_ms`, "2000");
      console.log(`L6: Woke up ${pciAddr}`);
    } catch (err) {
      console.log(`L6: Could not wake ${pciAddr}: ${err}`);
    }
  }

  // Wait for USB enumeration
  console.log("L6: Waiting for USB enumeration (5s)...");
  await new Promise((r) => setTimeout(r, 5000));

  const newPath = await findM8UsbPath();
  if (newPath) {
    return { success: true, level: 3, message: `Runtime PM reset successful`, deviceFound: true };
  }

  return { success: false, level: 3, message: "Runtime PM reset complete but M8 not found", deviceFound: false };
}

/**
 * Ultimate Reset: Try EVERYTHING in order of aggressiveness
 * This is the last resort before physical unplug
 */
export async function ultimateReset(): Promise<ResetResult> {
  console.log("\n" + "=".repeat(60));
  console.log("ULTIMATE RESET: Trying all recovery methods...");
  console.log("=".repeat(60) + "\n");

  const methods = [
    { name: "Level 1 (authorized)", fn: () => resetLevel1(2000) },
    { name: "Level 2 (remove+rescan)", fn: () => resetLevel2(5000) },
    { name: "Level 3 (xHCI unbind)", fn: () => resetLevel3(10000) },
    { name: "Level 6 (Runtime PM)", fn: () => resetLevel6_RuntimePM(15000) },
    { name: "Nuclear (all controllers)", fn: () => resetAllControllers(20000) },
    { name: "Level 4 (D3cold)", fn: () => resetLevel4_D3cold(30000) },
    { name: "Level 5 (multi-cycle)", fn: () => resetLevel5_MultiCycle(2, 30000) },
  ];

  for (const method of methods) {
    console.log(`\n>>> Trying: ${method.name}`);
    console.log("-".repeat(40));

    try {
      const result = await method.fn();
      if (result.success && result.deviceFound) {
        console.log(`\n✓ SUCCESS with ${method.name}!`);
        return { ...result, message: `Ultimate reset succeeded with: ${method.name}` };
      }
      console.log(`✗ ${method.name} failed: ${result.message}`);
    } catch (err) {
      console.log(`✗ ${method.name} threw error: ${err}`);
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log("ULTIMATE RESET FAILED - Physical unplug required");
  console.log("=".repeat(60) + "\n");

  return {
    success: false,
    level: 3,
    message: "All recovery methods failed. Physical USB unplug required.",
    deviceFound: false,
  };
}

/**
 * Get M8 USB device info
 */
export async function getM8UsbInfo(): Promise<{
  path: string;
  authorized: boolean;
  product: string;
  bus: string | null;
  controller: string | null;
} | null> {
  const path = await findM8UsbPath();
  if (!path) return null;

  try {
    const authorized = (await readFile(`${path}/authorized`, "utf-8")).trim() === "1";
    const product = (await readFile(`${path}/product`, "utf-8")).trim();
    const bus = await getM8BusNumber();
    const controller = await getUsbControllerPciAddress();

    return { path, authorized, product, bus, controller };
  } catch {
    return null;
  }
}
