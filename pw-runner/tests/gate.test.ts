import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { analyze, classifySelector, rewritePlaywrightImports } from "../src/gate.js";

const H = "import { test, expect } from '@playwright/test';\n";
const rules = (code: string, spec = {}) => analyze(H + code, "learner.spec.ts", spec).findings.map((f) => f.rule);
const find = (code: string, rule: string, spec = {}) => analyze(H + code, "learner.spec.ts", spec).findings.find((f) => f.rule === rule);

const GOOD = `test('login', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('qa@example.com');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome' })).toBeVisible();
});`;

describe("gate: static analysis", () => {
  test("clean idiomatic test has no findings", () => {
    const r = analyze(H + GOOD, "learner.spec.ts", { forbidCss: true });
    assert.deepEqual(r.findings, []);
    assert.equal(r.testCount, 1);
    assert.equal(r.rejected, false);
  });

  test("syntax error rejects with a line number", () => {
    const r = analyze(H + "test('x', async ({ page }) => {\n  await page.goto('/'\n});", "learner.spec.ts");
    assert.equal(r.rejected, true);
    const f = r.findings.find((x) => x.rule === "syntax-error");
    assert.ok(f && f.line && f.line >= 2);
  });

  test("forbidden imports and APIs are rejected before running", () => {
    for (const code of [
      "import fs from 'node:fs';\n" + GOOD,
      "import { execSync } from 'child_process';\n" + GOOD,
      GOOD + "\nconst x = require('fs');",
      GOOD + "\nprocess.exit(1);",
      GOOD + "\neval('1');",
      GOOD + "\nconst m = import('fs');",
      GOOD + "\nconst f = new Function('return 1');",
      GOOD + "\nconst g = globalThis;",
      "test.use({ launchOptions: { executablePath: '/bin/sh' } });\n" + GOOD,
      GOOD + "\nconst c = ({}).constructor;",
    ]) {
      const r = analyze(H + code, "learner.spec.ts");
      assert.equal(r.rejected, true, code);
      assert.ok(r.findings.some((f) => f.rule === "forbidden-import" || f.rule === "forbidden-api"), code);
    }
  });

  test("support-file imports are allowed only when listed", () => {
    const code = "import { LoginPage } from './pages/LoginPage';\n" + GOOD;
    assert.ok(rules(code).includes("forbidden-import"));
    assert.ok(!rules(code, { allowImports: ["./pages/LoginPage"] }).includes("forbidden-import"));
  });

  test("CSS and XPath selectors: error with forbidCss, warning otherwise", () => {
    const css = "test('a', async ({ page }) => { await page.goto('/'); await page.locator('#email').fill('x'); await expect(page.getByText('x')).toBeVisible(); });";
    const xp = "test('a', async ({ page }) => { await page.goto('/'); await page.locator('//button').click(); await expect(page.getByText('x')).toBeVisible(); });";
    assert.equal(find(css, "prefer-user-facing-locators", { forbidCss: true })?.severity, "error");
    assert.equal(find(css, "prefer-user-facing-locators")?.severity, "warning");
    assert.equal(find(xp, "prefer-user-facing-locators", { forbidCss: true })?.severity, "error");
    assert.ok(find("test('a', async ({ page }) => { await page.click('#go'); });", "prefer-user-facing-locators", { forbidCss: true }));
  });

  test("classifySelector", () => {
    assert.equal(classifySelector("//div[@id='x']"), "xpath");
    assert.equal(classifySelector("xpath=//a"), "xpath");
    assert.equal(classifySelector("#email"), "css");
    assert.equal(classifySelector("internal:role=button"), "engine");
  });

  test("missing await on matcher, action and test.step", () => {
    const m = find("test('a', async ({ page }) => {\n  await page.goto('/');\n  expect(page.getByText('Hi')).toBeVisible();\n});", "missing-await");
    assert.ok(m);
    assert.equal(m!.line, 4);
    assert.ok(rules("test('a', async ({ page }) => { page.getByRole('button').click(); await expect(page).toHaveTitle(/x/); });").includes("missing-await"));
    assert.ok(rules("test('a', async ({ page }) => { test.step('s', async () => { await page.goto('/'); }); await expect(page).toHaveTitle(/x/); });").includes("missing-await"));
    assert.ok(rules("test('a', async ({ request }) => { request.get('/api/products'); });").includes("missing-await"));
  });

  test("waitForTimeout is an error by default and a warning when allowed", () => {
    const c = "test('a', async ({ page }) => { await page.goto('/'); await page.waitForTimeout(500); await expect(page).toHaveTitle(/x/); });";
    assert.equal(find(c, "no-wait-for-timeout")?.severity, "error");
    assert.equal(find(c, "no-wait-for-timeout", { forbidWaitForTimeout: false })?.severity, "warning");
  });

  test("weak and non-retrying assertions", () => {
    assert.ok(rules("test('a', async ({ page }) => { await page.goto('/'); expect(page.getByText('Hi')).toBeTruthy(); });").includes("weak-assertion"));
    assert.ok(rules("test('a', async ({ page }) => { await page.goto('/'); const b = page.getByRole('button'); expect(b).toBeDefined(); });").includes("weak-assertion"));
    assert.ok(rules("test('a', async ({ page }) => { await page.goto('/'); expect(await page.getByText('Hi').isVisible()).toBe(true); });").includes("non-retrying-assertion"));
    assert.ok(rules("test('a', async ({ page }) => { await page.goto('/'); expect(page.url()).toContain('/x'); });").includes("non-retrying-assertion"));
    assert.ok(rules("test('a', async ({ page }) => { await page.goto('/'); expect(await page.title()).toBe('x'); });").includes("non-retrying-assertion"));
  });

  test("test.only and min-tests", () => {
    assert.ok(rules(GOOD.replace("test('login'", "test.only('login'")).includes("no-test-only"));
    assert.ok(rules("const x = 1;").includes("min-tests"));
    assert.ok(rules(GOOD, { minTests: 2 }).includes("min-tests"));
  });

  test("requirement rules produce stable rule ids", () => {
    const spec = {
      requires: [
        { rule: "call", anyOf: ["route", "routeFromHAR"], reason: "mock" },
        { rule: "new", anyOf: ["LoginPage"], reason: "pom" },
        { rule: "fixture", name: "loginPage", reason: "fixture" },
        { rule: "property", name: "storageState", reason: "state" },
        { rule: "forbid-call", anyOf: ["goto"], reason: "no goto" },
        { rule: "forbid-text", pattern: "getByLabel\\('Email'\\)", reason: "no UI login" },
        { rule: "require-text", pattern: "test\\.describe", reason: "group" },
      ],
    } as const;
    const r = rules(GOOD, spec as never);
    for (const id of ["requires-route", "requires-new-LoginPage", "requires-fixture-loginPage", "requires-storageState", "forbid-goto", "forbidden-pattern", "required-pattern"]) {
      assert.ok(r.includes(id), `${id} in ${r.join(",")}`);
    }
    const ok = rules(`class LoginPage { constructor(public page: any) {} }
test.describe('g', () => {
  test.use({ storageState: 'x.json' });
  test('a', async ({ page, loginPage }: any) => { new LoginPage(page); await page.route('**/api', (r) => r.continue()); await expect(page).toHaveTitle(/x/); });
});`, { requires: spec.requires.filter((x) => x.rule !== "forbid-call" && x.rule !== "forbid-text") } as never);
    assert.deepEqual(ok.filter((x) => x.startsWith("requires") || x === "required-pattern"), []);
  });

  test("playwright import ranges rewrite keeps line count", () => {
    const code = H + GOOD;
    const r = analyze(code, "learner.spec.ts");
    assert.equal(r.playwrightImportRanges.length, 1);
    const out = rewritePlaywrightImports(code, r.playwrightImportRanges, "../hub/test");
    assert.ok(out.includes("from '../hub/test'"));
    assert.equal(out.split("\n").length, code.split("\n").length);
  });
});
