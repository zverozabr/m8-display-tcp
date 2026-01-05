#!/usr/bin/env node
/**
 * M8 Display Setup CLI
 * Interactive setup wizard for users
 *
 * Usage: npx tsx src/cli/setup.ts
 */

import { createDiscovery } from "../discovery";
import { HealthChecker } from "../health";

const COLORS = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  dim: "\x1b[2m",
};

function ok(msg: string) {
  console.log(`${COLORS.green}✅${COLORS.reset} ${msg}`);
}

function fail(msg: string) {
  console.log(`${COLORS.red}❌${COLORS.reset} ${msg}`);
}

function warn(msg: string) {
  console.log(`${COLORS.yellow}⚠️${COLORS.reset} ${msg}`);
}

function info(msg: string) {
  console.log(`${COLORS.blue}ℹ️${COLORS.reset} ${msg}`);
}

function dim(msg: string) {
  console.log(`${COLORS.dim}${msg}${COLORS.reset}`);
}

async function main() {
  console.log("\n🎹 M8 Display Setup\n");
  console.log("─".repeat(40));

  const discovery = createDiscovery();
  const checker = new HealthChecker(discovery);

  console.log("\n🔍 Checking system...\n");

  const report = await checker.check();

  // Serial
  if (report.checks.serial.ok) {
    ok(`Serial: Found M8 at ${report.checks.serial.details?.path}`);
    if (report.checks.serial.details?.method === "path_fallback") {
      dim("   (Docker fallback mode - no VID/PID available)");
    }
  } else {
    fail(`Serial: ${report.checks.serial.message}`);
  }

  // Audio
  if (report.checks.audio.ok) {
    ok(`Audio:  Found at ${report.checks.audio.details?.path}`);
  } else {
    warn(`Audio:  ${report.checks.audio.message}`);
    dim("   (Audio is optional - display will still work)");
  }

  // Permissions
  if (report.checks.permissions.ok) {
    ok("Permissions: All OK");
  } else {
    warn(`Permissions: ${report.checks.permissions.message}`);
  }

  // Docker
  if (report.checks.docker.details?.isDocker) {
    if (report.checks.docker.ok) {
      ok("Docker: Properly configured");
    } else {
      warn(`Docker: ${report.checks.docker.message}`);
    }
  }

  // Overall
  console.log("\n" + "─".repeat(40));

  if (report.status === "healthy") {
    console.log(`\n${COLORS.green}✨ All checks passed!${COLORS.reset}\n`);
    console.log("Start the server with:");
    console.log(`  ${COLORS.dim}npx tsx src/index.ts${COLORS.reset}\n`);
  } else if (report.status === "degraded") {
    console.log(`\n${COLORS.yellow}⚠️  Some issues found (non-critical)${COLORS.reset}\n`);
  } else {
    console.log(`\n${COLORS.red}❌ Issues found${COLORS.reset}\n`);
  }

  // Suggestions
  if (report.suggestions.length > 0) {
    console.log("💡 Suggestions:\n");
    for (const suggestion of report.suggestions) {
      console.log(`   ${suggestion}`);
    }
    console.log();
  }

  // List available devices
  const ports = await discovery.listSerialPorts();
  if (ports.length > 0) {
    console.log("📋 Available serial ports:");
    for (const port of ports) {
      const isM8 = port.vendorId === "16c0";
      const marker = isM8 ? `${COLORS.green}← M8${COLORS.reset}` : "";
      console.log(`   ${port.path} ${marker}`);
      if (port.vendorId) {
        dim(`      VID:PID = ${port.vendorId}:${port.productId}`);
      }
    }
    console.log();
  }

  const audioDevices = await discovery.listAudioDevices();
  if (audioDevices.length > 0) {
    console.log("🔊 Available audio devices:");
    for (const device of audioDevices) {
      const isM8 = device.includes("M8") || device.includes("Teensy");
      const marker = isM8 ? `${COLORS.green}← M8${COLORS.reset}` : "";
      console.log(`   ${device} ${marker}`);
    }
    console.log();
  }

  // Docker command
  if (!report.checks.docker.details?.isDocker && report.status !== "healthy") {
    console.log("🐳 Docker command (recommended):\n");
    console.log(`   docker run -d --name m8-display \\
     --network=host --privileged \\
     -v /dev:/dev \\
     m8-display:latest\n`);
  }

  return report.status === "healthy" ? 0 : 1;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error("Setup failed:", err);
    process.exit(1);
  });
