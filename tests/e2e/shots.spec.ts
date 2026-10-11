/**
 * Design screenshots of the Figma screens in light/dark × English/Urdu, for comparing
 * with the Figma frames. Skipped unless SHOTS=1:  SHOTS=1 npx playwright test shots
 */
import { setup, test } from "./fixtures";

const OUT = process.env.SHOTS_DIR ?? "test-results/shots";
const screens: [string, string, boolean][] = [
  ["welcome", "/", false], ["home", "/", true], ["pay", "/c/c1/pay", true],
  ["ledger", "/ledger", true], ["toss", "/toss", true], ["receipt", "/c/c1/review/s1", true]
];

test.describe("design shots", () => {
  test.skip(!process.env.SHOTS, "set SHOTS=1 to capture");
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  for (const lang of ["en", "ur"] as const)
    for (const theme of ["light", "dark"] as const)
      for (const [name, path, signedIn] of screens)
        test(`${name} ${lang} ${theme}`, async ({ page }) => {
          await setup(page, { lang, signedIn });
          await page.addInitScript(t => localStorage.setItem("bari.theme", t), theme);
          await page.goto(path);
          await page.waitForLoadState("networkidle");
          await page.evaluate(() => document.fonts.ready);
          await page.waitForTimeout(400);
          await page.screenshot({ path: `${OUT}/${name}-${lang}-${theme}.png` });
        });
});
