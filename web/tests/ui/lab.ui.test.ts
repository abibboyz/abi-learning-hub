/**
 * Browser tests for the lab UI against a running hub (default http://localhost:3000).
 *   cd web && HUB_URL=http://localhost:3000 npm run test:ui
 * Needs the stack up (docker compose up, or the services locally) and Chromium
 * (npx playwright install chromium).
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { chromium, type Browser, type Page } from "playwright";
import AxeBuilder from "@axe-core/playwright";

const BASE = (process.env.HUB_URL || "http://localhost:3000").replace(/\/$/, "");
let browser: Browser;

before(async () => {
  browser = await chromium.launch();
});
after(async () => {
  await browser?.close();
});

async function page(opts: { scheme?: "light" | "dark"; width?: number } = {}): Promise<Page> {
  const ctx = await browser.newContext({ colorScheme: opts.scheme || "dark", viewport: { width: opts.width || 1440, height: 900 } });
  return ctx.newPage();
}

async function status(p: Page, re: RegExp): Promise<string> {
  const pane = p.getByTestId("exercise-pane");
  for (let i = 0; i < 80; i++) {
    const s = (await pane.getAttribute("data-status")) || "";
    if (re.test(s)) return s;
    await p.waitForTimeout(250);
  }
  return (await pane.getAttribute("data-status")) || "";
}

async function openLab(p: Page, q: string) {
  await p.goto(`${BASE}/lab?${q}`);
  await p.getByTestId("exercise-pane").waitFor({ timeout: 30_000 });
}

async function axe(p: Page) {
  // let entrance animations finish so colours are measured at full opacity
  await p.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => null))));
  const r = await new AxeBuilder({ page: p }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  return r.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.length} node(s) — ${v.nodes[0]?.target.join(" ")}`);
}

describe("accessibility (axe, WCAG 2.1 AA)", () => {
  for (const scheme of ["dark", "light"] as const) {
    test(`home, tracks and lab have no violations (${scheme})`, async () => {
      const p = await page({ scheme });
      const found: string[] = [];
      for (const path of ["/", "/tracks"]) {
        await p.goto(`${BASE}${path}`);
        await p.waitForLoadState("networkidle");
        found.push(...(await axe(p)).map((v) => `${path}: ${v}`));
      }
      await openLab(p, "track=sql-postgres&mode=execute");
      found.push(...(await axe(p)).map((v) => `lab idle: ${v}`));
      await p.getByTestId("check-btn").click();
      await status(p, /failed|error|passed/);
      found.push(...(await axe(p)).map((v) => `lab after Check: ${v}`));
      await openLab(p, "track=node-typescript&mode=topics");
      found.push(...(await axe(p)).map((v) => `lessons: ${v}`));
      await p.context().close();
      assert.deepEqual(found, []);
    });
  }
});

describe("run and check", () => {
  test("Run executes without grading; Check grades and ticks the checklist; pass → Next", async () => {
    const p = await page();
    await openLab(p, "track=sql-postgres&mode=execute&item=rel-01-create-connect");
    await p.evaluate(() => localStorage.clear());
    await p.getByTestId("run-btn").click();
    assert.equal(await status(p, /ran|error/), "ran");
    assert.match(await p.getByTestId("result-status").innerText(), /not graded/i);
    await p.getByTestId("check-btn").click();
    assert.equal(await status(p, /failed|passed|error/), "failed");
    assert.match(await p.getByTestId("checklist").innerText(), /✗/);
    // reveal the solution (behind a confirm), then Check with the keyboard from inside the editor
    await p.getByTestId("hint-btn").click();
    await p.getByRole("button", { name: "Reveal solution…" }).click();
    await p.getByRole("button", { name: "Yes, reveal" }).click();
    await p.getByTestId("exercise-pane").locator(".cm-content").click();
    await p.keyboard.press("Control+Shift+Enter");
    assert.equal(await status(p, /passed|failed|error/), "passed");
    assert.ok(await p.getByTestId("next-btn").isVisible(), "Check turns into Next after a pass");
    const saved = await p.evaluate(() => JSON.parse(localStorage.getItem("alh:progress:sql-postgres") || "{}"));
    assert.ok(saved.passed?.includes("rel-01-create-connect"));
    assert.ok(saved.assisted?.includes("rel-01-create-connect"), "revealing the solution marks the item assisted");
    await p.getByTestId("next-btn").click();
    await p.waitForTimeout(500);
    assert.notEqual(await p.locator("#item-title").innerText(), "Create & connect");
    await p.reload();
    await p.getByTestId("item-list").waitFor();
    assert.match(await p.getByTestId("item-list").innerText(), /1\/\d+ tasks passed/);
    await p.context().close();
  });

  test("a Python error shows an error card with the line and marks the gutter; Ctrl+Enter runs", async () => {
    const p = await page();
    await openLab(p, "track=python-sqlalchemy&mode=execute");
    const ed = p.getByTestId("exercise-pane").locator(".cm-content");
    await ed.click();
    await p.keyboard.press("Control+End");
    await p.keyboard.type("\nthis is not python(");
    await p.keyboard.press("Control+Enter");
    assert.equal(await status(p, /ran|error|failed/), "error");
    const card = p.getByTestId("error-card");
    assert.match(await card.innerText(), /Line \d+/);
    assert.equal(await p.getByTestId("exercise-pane").locator(".cm-line.alh-error-line").count(), 1);
    await card.getByRole("button", { name: /Go to line/ }).click();
    assert.ok(await p.evaluate(() => Boolean(document.activeElement?.closest(".cm-editor"))), "Go to line focuses the editor");
    await p.context().close();
  });
});

describe("keyboard and layout", () => {
  test("skip link, ? sheet (Esc closes, focus returns), tabs with arrow keys", async () => {
    const p = await page();
    await openLab(p, "track=sql-postgres&mode=execute");
    await p.keyboard.press("Tab");
    assert.equal(await p.evaluate(() => document.activeElement?.textContent?.trim()), "Skip to content");
    await p.keyboard.press("Enter");
    assert.equal(await p.evaluate(() => document.activeElement?.id), "main-content");
    const btn = p.getByRole("button", { name: "Keyboard shortcuts" });
    await btn.focus();
    await p.keyboard.press("?");
    assert.equal(await p.locator("dialog[open]").count(), 1);
    await p.keyboard.press("Escape");
    assert.equal(await p.locator("dialog[open]").count(), 0);
    assert.equal(await p.evaluate(() => document.activeElement?.getAttribute("aria-label")), "Keyboard shortcuts");
    // typing ? inside the editor does not open the sheet
    await p.getByTestId("exercise-pane").locator(".cm-content").click();
    await p.keyboard.type("?");
    assert.equal(await p.locator("dialog[open]").count(), 0);
    const first = p.getByRole("tab").first();
    await first.focus();
    await p.keyboard.press("ArrowRight");
    assert.equal(await p.getByRole("tab", { selected: true }).innerText(), "Check");
    await p.context().close();
  });

  test("320px wide: no horizontal page scroll, Run/Check bar reachable", async () => {
    const p = await page({ width: 320 });
    await openLab(p, "track=sql-postgres&mode=execute");
    const over = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(over <= 1, `page overflows by ${over}px`);
    assert.ok(await p.getByTestId("check-btn").isVisible());
    await p.context().close();
  });

  test("theme toggle is saved and applied before paint", async () => {
    const p = await page({ scheme: "dark" });
    await p.goto(`${BASE}/`);
    await p.evaluate(() => localStorage.setItem("alh:theme", "light"));
    await p.reload();
    assert.match(await p.evaluate(() => document.documentElement.className), /light/);
    await p.getByRole("button", { name: /^Theme: light/ }).click(); // light → system
    assert.equal(await p.evaluate(() => localStorage.getItem("alh:theme")), "system");
    await p.context().close();
  });
});
