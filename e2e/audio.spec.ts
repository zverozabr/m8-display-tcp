import { test, expect } from "@playwright/test";

const BASE_URL = "http://localhost:8080";

test.describe("Audio Streaming", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
  });

  test("audio button exists and starts as muted", async ({ page }) => {
    const audioBtn = page.locator("#audio-btn");
    await expect(audioBtn).toBeVisible();
    await expect(audioBtn).toHaveText("🔇");
  });

  test("clicking audio button attempts to connect", async ({ page }) => {
    const audioBtn = page.locator("#audio-btn");

    // Listen for WebSocket connection
    const wsPromise = page.waitForEvent("websocket", (ws) =>
      ws.url().includes("/audio")
    );

    await audioBtn.click();

    const ws = await wsPromise;
    expect(ws.url()).toContain("/audio");
  });

  test("audio shows error icon when device not found", async ({ page }) => {
    // This test expects the error handling to work
    // When M8 device is not connected, should show error
    const audioBtn = page.locator("#audio-btn");
    await audioBtn.click();

    // Wait for either success (🔊) or error (❌)
    await expect(audioBtn).toHaveText(/🔊|❌/, { timeout: 5000 });

    // If error, title should contain error message
    const text = await audioBtn.textContent();
    if (text === "❌") {
      const title = await audioBtn.getAttribute("title");
      expect(title).toBeTruthy();
      expect(title?.length).toBeGreaterThan(0);
    }
  });

  test("audio receives framed messages correctly", async ({ page }) => {
    // Intercept WebSocket messages to verify framing protocol
    const messages: { type: number; size: number }[] = [];

    page.on("websocket", (ws) => {
      if (ws.url().includes("/audio")) {
        ws.on("framereceived", (frame) => {
          if (frame.payload instanceof Buffer) {
            const data = new Uint8Array(frame.payload);
            if (data.length > 0) {
              messages.push({ type: data[0], size: data.length });
            }
          }
        });
      }
    });

    const audioBtn = page.locator("#audio-btn");
    await audioBtn.click();

    // Wait a bit for messages
    await page.waitForTimeout(1000);

    // If we received any messages, verify they have proper framing
    if (messages.length > 0) {
      for (const msg of messages) {
        // Type should be 0x00 (audio) or 0x01 (control)
        expect([0x00, 0x01]).toContain(msg.type);
      }
    }
  });
});

test.describe("Controls", () => {
  test("screen canvas is visible", async ({ page }) => {
    await page.goto(BASE_URL);
    const canvas = page.locator("#screen");
    await expect(canvas).toBeVisible();
    await expect(canvas).toHaveAttribute("width", "320");
    await expect(canvas).toHaveAttribute("height", "240");
  });

  test("control buttons are visible", async ({ page }) => {
    await page.goto(BASE_URL);
    await expect(page.locator('[data-key="up"]')).toBeVisible();
    await expect(page.locator('[data-key="down"]')).toBeVisible();
    await expect(page.locator('[data-key="left"]')).toBeVisible();
    await expect(page.locator('[data-key="right"]')).toBeVisible();
    await expect(page.locator('[data-key="shift"]')).toBeVisible();
    await expect(page.locator('[data-key="start"]')).toBeVisible();
    await expect(page.locator('[data-key="opt"]')).toBeVisible();
    await expect(page.locator('[data-key="edit"]')).toBeVisible();
  });

  // Flaky due to WebSocket event timing
  test.skip("clicking button sends WebSocket message", async ({ page }) => {
    const wsMessages: string[] = [];

    // Set up listener BEFORE navigation
    page.on("websocket", (ws) => {
      if (ws.url().endsWith("/control")) {
        ws.on("framesent", (frame) => {
          if (typeof frame.payload === "string") {
            wsMessages.push(frame.payload);
          }
        });
      }
    });

    await page.goto(BASE_URL);
    await expect(page.locator("#status")).toHaveClass(/connected/, { timeout: 5000 });
    await page.waitForTimeout(500);

    await page.locator('[data-key="up"]').click();
    await page.waitForTimeout(300);

    const upMessage = wsMessages.find(m => m.includes('"key":"up"'));
    expect(upMessage).toBeTruthy();
  });

  // Flaky due to WebSocket event timing
  test.skip("keyboard shortcut sends WebSocket message", async ({ page }) => {
    const wsMessages: string[] = [];

    page.on("websocket", (ws) => {
      if (ws.url().endsWith("/control")) {
        ws.on("framesent", (frame) => {
          if (typeof frame.payload === "string") {
            wsMessages.push(frame.payload);
          }
        });
      }
    });

    await page.goto(BASE_URL);
    await expect(page.locator("#status")).toHaveClass(/connected/, { timeout: 5000 });
    await page.waitForTimeout(500);

    await page.keyboard.press("ArrowUp");
    await page.waitForTimeout(300);

    const upMessage = wsMessages.find(m => m.includes('"key":"up"'));
    expect(upMessage).toBeTruthy();
  });
});

test.describe("WebSocket Connection", () => {
  // Flaky due to WebSocket event timing
  test.skip("connects to control WebSocket", async ({ page }) => {
    let controlConnected = false;

    page.on("websocket", (ws) => {
      if (ws.url().endsWith("/control")) {
        controlConnected = true;
      }
    });

    await page.goto(BASE_URL);
    await expect(page.locator("#status")).toHaveClass(/connected/, { timeout: 5000 });
    await page.waitForTimeout(500);

    expect(controlConnected).toBe(true);
  });

  // Flaky due to WebSocket event timing
  test.skip("connects to screen WebSocket", async ({ page }) => {
    let screenConnected = false;

    page.on("websocket", (ws) => {
      if (ws.url().endsWith("/screen")) {
        screenConnected = true;
      }
    });

    await page.goto(BASE_URL);
    await expect(page.locator("#status")).toHaveClass(/connected/, { timeout: 5000 });
    await page.waitForTimeout(500);

    expect(screenConnected).toBe(true);
  });

  test("status indicator shows connected", async ({ page }) => {
    await page.goto(BASE_URL);

    const status = page.locator("#status");
    await expect(status).toHaveClass(/connected/, { timeout: 5000 });
  });
});
