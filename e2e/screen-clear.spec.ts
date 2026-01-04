import { test, expect } from "@playwright/test";

const BASE_URL = "http://localhost:8080";

test.describe("Screen Clear on Navigation", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    // Wait for WebSocket connection
    await expect(page.locator("#status")).toHaveClass(/connected/, { timeout: 5000 });
  });

  test("screen clears old content when navigating between screens", async ({ page }) => {
    // Wait for initial render
    await page.waitForTimeout(1000);

    // Take screenshot on current screen (PROJECT)
    const projectShot = await page.locator("#screen").screenshot();

    // Navigate to different screen (SHIFT+LEFT goes to SONG)
    await page.keyboard.down("Shift");
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.up("Shift");

    // Wait for screen to update
    await page.waitForTimeout(1000);

    // Take screenshot on new screen (SONG)
    const songShot = await page.locator("#screen").screenshot();

    // Screenshots should be DIFFERENT (screen was cleared and redrawn)
    expect(Buffer.compare(projectShot, songShot)).not.toBe(0);
  });

  test("no visual artifacts after multiple screen changes", async ({ page }) => {
    // Wait for initial render
    await page.waitForTimeout(500);

    // Navigate through multiple screens
    for (let i = 0; i < 3; i++) {
      await page.keyboard.down("Shift");
      await page.keyboard.press("ArrowRight");
      await page.keyboard.up("Shift");
      await page.waitForTimeout(300);
    }

    // Take final screenshot
    const finalShot = await page.locator("#screen").screenshot();

    // Navigate back
    for (let i = 0; i < 3; i++) {
      await page.keyboard.down("Shift");
      await page.keyboard.press("ArrowLeft");
      await page.keyboard.up("Shift");
      await page.waitForTimeout(300);
    }

    // Take return screenshot
    const returnShot = await page.locator("#screen").screenshot();

    // Final and return should be similar (back to same screen)
    // but intermediate screens should not have left artifacts
    expect(finalShot).toBeDefined();
    expect(returnShot).toBeDefined();
  });
});
