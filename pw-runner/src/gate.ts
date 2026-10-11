/**
 * Static half of the Playwright task gate.
 *
 * Parses the learner's test file with the TypeScript compiler API (works for .ts and .js)
 * and reports specific, teachable findings: CSS/XPath selectors where user-facing locators
 * are expected, missing awaits, waitForTimeout, weak/non-retrying assertions, test.only,
 * missing required APIs (route mocking, storageState, page objects, fixtures…), and unsafe code
 * that must never reach the runner.
 */
import ts from "typescript";

export type Severity = "reject" | "error" | "warning";

export type Finding = {
  rule: string;
  severity: Severity;
  message: string;
  line?: number;
  column?: number;
};

export type Requirement =
  | { rule: "call"; anyOf: string[]; reason: string }
  | { rule: "new"; anyOf: string[]; reason: string }
  | { rule: "fixture"; name: string; reason: string }
  | { rule: "property"; name: string; reason: string }
  | { rule: "forbid-call"; anyOf: string[]; reason: string }
  | { rule: "min-tests"; count: number; reason?: string }
  | { rule: "forbid-text"; pattern: string; reason: string }
  | { rule: "require-text"; pattern: string; reason: string };

export type GateSpec = {
  /** Fail when CSS/XPath selectors are used instead of user-facing locators. */
  forbidCss?: boolean;
  /** Fail (not just warn) on page.waitForTimeout(). Default true for tasks. */
  forbidWaitForTimeout?: boolean;
  minTests?: number;
  /** Minimum distinct tests that must actually run (data-driven loops count once statically). */
  minRunTests?: number;
  requires?: Requirement[];
  /** Extra relative modules the learner may import (support files shipped with the task). */
  allowImports?: string[];
};

export type StaticReport = {
  findings: Finding[];
  testCount: number;
  rejected: boolean;
  /** Module specifiers seen, for rewriting '@playwright/test' to the hub wrapper. */
  playwrightImportRanges: Array<{ start: number; end: number }>;
};

const ALLOWED_MODULES = new Set(["@playwright/test", "path", "node:path"]);

/** Web-first (auto-retrying) matchers: they return a Promise and must be awaited. */
export const ASYNC_MATCHERS = new Set([
  "toBeAttached", "toBeChecked", "toBeDisabled", "toBeEditable", "toBeEmpty", "toBeEnabled",
  "toBeFocused", "toBeHidden", "toBeInViewport", "toBeVisible", "toContainText", "toContainClass",
  "toHaveAccessibleDescription", "toHaveAccessibleErrorMessage", "toHaveAccessibleName",
  "toHaveAttribute", "toHaveClass", "toHaveCount", "toHaveCSS", "toHaveId", "toHaveJSProperty",
  "toHaveRole", "toHaveScreenshot", "toHaveText", "toHaveValue", "toHaveValues", "toHaveTitle",
  "toHaveURL", "toBeOK", "toMatchAriaSnapshot", "toPass",
]);

/** Page/locator/request methods that return a Promise. Unawaited, they race the test. */
const ACTIONS = new Set([
  "goto", "click", "dblclick", "fill", "check", "uncheck", "setChecked", "press", "pressSequentially",
  "type", "selectOption", "setInputFiles", "hover", "tap", "focus", "blur", "clear", "dragTo",
  "waitForURL", "waitForLoadState", "waitForResponse", "waitForRequest", "waitForEvent",
  "waitForSelector", "waitFor", "reload", "goBack", "goForward", "route", "unroute", "routeFromHAR",
  "screenshot", "evaluate", "setViewportSize", "accept", "dismiss", "fulfill", "abort",
  "storageState", "addCookies", "newPage", "newContext", "scrollIntoViewIfNeeded", "selectText",
  "dispatchEvent", "setExtraHTTPHeaders", "addInitScript",
]);
/** Ambiguous names (Map.get, Set.delete…) only count as actions on a request context. */
const REQUEST_ACTIONS = new Set(["get", "post", "put", "delete", "patch", "fetch", "head"]);

const LOCATOR_FACTORIES = new Set([
  "getByRole", "getByLabel", "getByPlaceholder", "getByText", "getByAltText", "getByTitle",
  "getByTestId", "locator", "frameLocator", "first", "last", "nth", "filter", "and", "or",
  "within", "contentFrame", "getByRef",
]);

const SNAPSHOT_READS: Record<string, string> = {
  isVisible: "await expect(locator).toBeVisible()",
  isHidden: "await expect(locator).toBeHidden()",
  isEnabled: "await expect(locator).toBeEnabled()",
  isDisabled: "await expect(locator).toBeDisabled()",
  isChecked: "await expect(locator).toBeChecked()",
  textContent: "await expect(locator).toHaveText(...) or toContainText(...)",
  innerText: "await expect(locator).toHaveText(...) or toContainText(...)",
  allTextContents: "await expect(locator).toHaveText([...])",
  allInnerTexts: "await expect(locator).toHaveText([...])",
  inputValue: "await expect(locator).toHaveValue(...)",
  count: "await expect(locator).toHaveCount(n)",
  getAttribute: "await expect(locator).toHaveAttribute(name, value)",
  title: "await expect(page).toHaveTitle(...)",
  url: "await expect(page).toHaveURL(...)",
};

const WEAK_MATCHERS = new Set(["toBeTruthy", "toBeDefined", "toBeInstanceOf", "toBeFalsy", "toBeNull", "toBeUndefined"]);

const LEGACY_SELECTOR_METHODS = new Set([
  "$", "$$", "$eval", "$$eval", "click", "dblclick", "fill", "check", "uncheck", "type", "press",
  "hover", "tap", "focus", "selectOption", "setInputFiles", "textContent", "innerText", "isVisible",
  "waitForSelector", "getAttribute", "inputValue", "isChecked",
]);

const FORBIDDEN_IDENTIFIERS = new Set(["require", "process", "eval", "Function", "globalThis", "module", "Deno", "Bun"]);
const FORBIDDEN_PROPERTIES = new Set(["launchOptions", "connectOptions", "executablePath", "constructor", "__proto__"]);

function calleeName(expr: ts.Expression): string | null {
  if (ts.isIdentifier(expr)) return expr.text;
  if (ts.isPropertyAccessExpression(expr)) return expr.name.text;
  if (ts.isElementAccessExpression(expr) && ts.isStringLiteralLike(expr.argumentExpression)) return expr.argumentExpression.text;
  return null;
}

function receiverOf(expr: ts.Expression): ts.Expression | null {
  if (ts.isPropertyAccessExpression(expr) || ts.isElementAccessExpression(expr)) return expr.expression;
  return null;
}

/** Walks `expect(x).not.toBe()` style chains back to the expect(...) call, if any. */
function expectCallOf(call: ts.CallExpression): ts.CallExpression | null {
  let cur: ts.Expression = call.expression;
  while (ts.isPropertyAccessExpression(cur) || ts.isElementAccessExpression(cur)) {
    cur = cur.expression;
    if (ts.isCallExpression(cur)) {
      const n = calleeName(cur.expression);
      if (n === "expect") return cur;
      if ((n === "soft" || n === "poll") && ts.isPropertyAccessExpression(cur.expression) &&
          ts.isIdentifier(cur.expression.expression) && cur.expression.expression.text === "expect") return cur;
      return null;
    }
  }
  return null;
}

function isExpectPoll(expectCall: ts.CallExpression): boolean {
  return ts.isPropertyAccessExpression(expectCall.expression) && expectCall.expression.name.text === "poll";
}

function rootIdentifier(expr: ts.Expression): string | null {
  let cur: ts.Expression = expr;
  for (;;) {
    if (ts.isIdentifier(cur)) return cur.text;
    if (cur.kind === ts.SyntaxKind.ThisKeyword) return "this";
    if (ts.isPropertyAccessExpression(cur) || ts.isElementAccessExpression(cur)) cur = cur.expression;
    else if (ts.isCallExpression(cur)) cur = cur.expression;
    else if (ts.isParenthesizedExpression(cur) || ts.isNonNullExpression(cur)) cur = cur.expression;
    else return null;
  }
}

function stringArg(node: ts.CallExpression, i = 0): string | null {
  const a = node.arguments[i];
  if (!a) return null;
  if (ts.isStringLiteralLike(a)) return a.text;
  if (ts.isTemplateExpression(a)) return a.head.text;
  return null;
}

export function classifySelector(sel: string): "xpath" | "css" | "engine" {
  const s = sel.trim();
  if (s.startsWith("//") || s.startsWith("(//") || s.startsWith("xpath=") || s.startsWith("..")) return "xpath";
  if (/^(internal:|(text|role|data-testid|id)=)/.test(s)) return "engine";
  return "css";
}

export function analyze(code: string, fileName: string, spec: GateSpec = {}): StaticReport {
  const isJs = /\.(m|c)?js$/.test(fileName);
  const sf = ts.createSourceFile(fileName, code, ts.ScriptTarget.Latest, true, isJs ? ts.ScriptKind.JS : ts.ScriptKind.TS);
  const findings: Finding[] = [];
  const pos = (n: ts.Node) => {
    const lc = sf.getLineAndCharacterOfPosition(n.getStart(sf));
    return { line: lc.line + 1, column: lc.character + 1 };
  };
  const add = (rule: string, severity: Severity, message: string, node?: ts.Node) =>
    findings.push({ rule, severity, message, ...(node ? pos(node) : {}) });

  // Syntax errors first: there is no point running a file that does not parse.
  const diags = (sf as unknown as { parseDiagnostics?: ts.Diagnostic[] }).parseDiagnostics || [];
  for (const d of diags.slice(0, 5)) {
    const lc = d.start !== undefined ? sf.getLineAndCharacterOfPosition(d.start) : { line: 0, character: 0 };
    findings.push({
      rule: "syntax-error", severity: "reject",
      message: `Syntax error: ${ts.flattenDiagnosticMessageText(d.messageText, "\n")}`,
      line: lc.line + 1, column: lc.character + 1,
    });
  }

  const allowImports = new Set([...(spec.allowImports || [])]);
  const pwRanges: Array<{ start: number; end: number }> = [];
  const locatorVars = new Set<string>();
  const callNames = new Map<string, ts.Node>();
  const newNames = new Set<string>();
  const propertyNames = new Set<string>();
  const fixtureNames = new Set<string>();
  const testNames = new Set(["test", "it", "setup"]);
  let testCount = 0;

  // Pass 1: imports + names bound to locators (so `expect(button).toBeTruthy()` is caught too).
  const collect = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const mod = node.moduleSpecifier.text;
      const ok = ALLOWED_MODULES.has(mod) || (mod.startsWith("./") && (allowImports.has(mod) || allowImports.has(mod.replace(/\.(ts|js)$/, ""))));
      if (!ok) {
        add("forbidden-import", "reject", `Import of '${mod}' is not allowed in the lab. Use '@playwright/test'${allowImports.size ? ` or ${[...allowImports].map((m) => `'${m}'`).join(", ")}` : ""}.`, node);
      }
      if (mod === "@playwright/test") {
        pwRanges.push({ start: node.moduleSpecifier.getStart(sf) + 1, end: node.moduleSpecifier.getEnd() - 1 });
        const nb = node.importClause?.namedBindings;
        if (nb && ts.isNamedImports(nb)) for (const el of nb.elements) {
          if ((el.propertyName?.text || el.name.text) === "test") testNames.add(el.name.text);
        }
      }
    }
    if (ts.isVariableDeclaration(node) && node.initializer && ts.isIdentifier(node.name)) {
      if (isLocatorExpr(node.initializer, locatorVars)) locatorVars.add(node.name.text);
    }
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        ts.isPropertyAccessExpression(node.left) && isLocatorExpr(node.right, locatorVars)) {
      locatorVars.add(node.left.name.text);
    }
    if (ts.isPropertyDeclaration(node) && node.initializer && ts.isIdentifier(node.name) && isLocatorExpr(node.initializer, locatorVars)) {
      locatorVars.add(node.name.text);
    }
    ts.forEachChild(node, collect);
  };
  collect(sf);

  // Pass 2: rules.
  const visit = (node: ts.Node) => {
    if (ts.isIdentifier(node) && FORBIDDEN_IDENTIFIERS.has(node.text)) {
      const parent = node.parent;
      const isPropName = parent && (ts.isPropertyAccessExpression(parent) && parent.name === node);
      const isKey = parent && (ts.isPropertyAssignment(parent) || ts.isMethodDeclaration(parent)) && parent.name === node;
      if (!isPropName && !isKey) add("forbidden-api", "reject", `'${node.text}' is not available in the lab runner: tests may only drive the browser and the app under test.`, node);
    }
    if (ts.isPropertyAccessExpression(node) && FORBIDDEN_PROPERTIES.has(node.name.text)) {
      add("forbidden-api", "reject", `Accessing '.${node.name.text}' is not allowed in the lab runner.`, node.name);
    }
    if ((ts.isPropertyAssignment(node) || ts.isShorthandPropertyAssignment(node)) && node.name && ts.isIdentifier(node.name)) {
      propertyNames.add(node.name.text);
      if (FORBIDDEN_PROPERTIES.has(node.name.text)) add("forbidden-api", "reject", `The '${node.name.text}' option is controlled by the hub runner and cannot be set from a test.`, node);
    }
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      add("forbidden-api", "reject", "Dynamic import() is not allowed in the lab runner.", node);
    }
    if (ts.isNewExpression(node)) {
      const n = calleeName(node.expression);
      if (n) newNames.add(n);
    }
    // Fixture names destructured by test callbacks: test('x', async ({ page, request }) => ...)
    if ((ts.isArrowFunction(node) || ts.isFunctionExpression(node)) && node.parameters[0] && ts.isObjectBindingPattern(node.parameters[0].name)) {
      for (const el of node.parameters[0].name.elements) {
        const nm = el.propertyName && ts.isIdentifier(el.propertyName) ? el.propertyName.text : ts.isIdentifier(el.name) ? el.name.text : null;
        if (nm) fixtureNames.add(nm);
      }
    }

    if (ts.isCallExpression(node)) {
      const name = calleeName(node.expression);
      if (name && !callNames.has(name)) callNames.set(name, node);
      const recv = receiverOf(node.expression);
      const recvName = recv ? rootIdentifier(recv) : null;

      // Count tests: test('title', fn), test.only/skip/fixme/fail('title', fn)
      if (ts.isIdentifier(node.expression) && testNames.has(node.expression.text) && node.arguments.length >= 2) testCount++;
      if (ts.isPropertyAccessExpression(node.expression) && ts.isIdentifier(node.expression.expression) &&
          testNames.has(node.expression.expression.text) && ["only", "fixme", "fail", "skip", "slow"].includes(node.expression.name.text) &&
          node.arguments.length >= 2 && stringArg(node) !== null) testCount++;

      if (ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "only" &&
          ts.isIdentifier(node.expression.expression) && (testNames.has(node.expression.expression.text) || node.expression.expression.text === "describe")) {
        add("no-test-only", "error", "Remove .only: it silently skips every other test (and forbidOnly fails the CI run).", node);
      }
      if (ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "only" &&
          ts.isPropertyAccessExpression(node.expression.expression) && node.expression.expression.name.text === "describe") {
        add("no-test-only", "error", "Remove describe.only: it silently skips every other test.", node);
      }

      if (name === "waitForTimeout") {
        const forbid = spec.forbidWaitForTimeout ?? true;
        add("no-wait-for-timeout", forbid ? "error" : "warning",
          "Used waitForTimeout(): a fixed sleep is either too short (flaky) or too long (slow). Wait for a condition instead, e.g. await expect(locator).toBeVisible() or page.waitForResponse().", node);
      }

      // CSS / XPath selectors where user-facing locators are expected.
      if ((name === "locator" || name === "frameLocator") && stringArg(node) !== null && !isLocatorChainedFromPageObject(node)) {
        const sel = stringArg(node)!;
        const kind = classifySelector(sel);
        if (kind !== "engine") {
          const what = kind === "xpath" ? "an XPath selector" : "a CSS selector";
          const hint = name === "frameLocator"
            ? "Prefer page.getByTitle('…').contentFrame() to reach an iframe by its accessible title."
            : "Prefer getByRole / getByLabel / getByText (or getByTestId when nothing user-facing exists).";
          add("prefer-user-facing-locators", spec.forbidCss ? "error" : "warning",
            `Used ${what} ${JSON.stringify(sel)} in ${name}(). ${hint} These survive markup refactors and match how users find elements.`, node);
        }
      }
      if (name && LEGACY_SELECTOR_METHODS.has(name) && recvName && ["page", "frame"].includes(recvName) &&
          recv && ts.isIdentifier(recv) && stringArg(node) !== null) {
        add("prefer-user-facing-locators", spec.forbidCss ? "error" : "warning",
          `Used the selector-string API page.${name}(${JSON.stringify(stringArg(node))}). Use a locator instead, e.g. page.getByRole(…).${name === "$" || name === "$$" ? "first()" : name + "()"} — locators auto-wait and re-resolve.`, node);
      }

      const expectCall = expectCallOf(node);
      // Weak / non-retrying assertions.
      if (expectCall && name) {
        const subject = expectCall.arguments[0];
        if (subject && WEAK_MATCHERS.has(name) && isLocatorExpr(subject, locatorVars)) {
          add("weak-assertion", "error",
            `expect(locator).${name}() always passes: a Locator object is truthy even when the element does not exist. Use a web-first assertion such as await expect(locator).toBeVisible() or toHaveText().`, node);
        }
        if (subject && !isExpectPoll(expectCall)) {
          const inner = ts.isAwaitExpression(subject) ? subject.expression : subject;
          if (ts.isCallExpression(inner)) {
            const readName = calleeName(inner.expression);
            const readRecv = receiverOf(inner.expression);
            if (readName && SNAPSHOT_READS[readName] && readRecv && (readName !== "url" && readName !== "title" ? true : rootIdentifier(readRecv) === "page")) {
              add("non-retrying-assertion", "error",
                `expect(${readName === "url" || readName === "title" ? "page" : "await locator"}.${readName}()) checks a one-time snapshot and does not retry, so it fails on slow pages or passes on stale ones. Use ${SNAPSHOT_READS[readName]} instead.`, node);
            }
          }
        }
      }

      // Missing await: only flag calls whose value is thrown away (an expression statement).
      if (ts.isExpressionStatement(node.parent)) {
        if (expectCall && name && (ASYNC_MATCHERS.has(name) || isExpectPoll(expectCall))) {
          add("missing-await", "error",
            `Missing await on expect(…).${name}(). Web-first assertions return a Promise; without await the test can finish before the check runs, so failures are lost or reported against the wrong step.`, node);
        } else if (name === "step" && recvName && testNames.has(recvName)) {
          add("missing-await", "error", "Missing await on test.step(…). Steps are async; without await the step's actions run after the test has moved on.", node);
        } else if (!expectCall && name && recv && (ACTIONS.has(name) || (REQUEST_ACTIONS.has(name) && recvName !== null && /request|api/i.test(recvName)))) {
          if (!(recvName === "test" || recvName === "console" || recvName === "Promise")) {
            add("missing-await", "error",
              `Missing await on ${shortText(node.expression, sf)}(). Playwright actions are asynchronous: without await the next line runs before the action finishes, which causes random failures.`, node);
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);

  // Task requirements.
  const minTests = spec.minTests ?? 1;
  if (testCount < minTests) {
    add("min-tests", "error", testCount === 0
      ? "No tests found. Write at least one test('title', async ({ page }) => { … })."
      : `Found ${testCount} test(s); this task needs at least ${minTests}.`);
  }
  for (const r of spec.requires || []) {
    if (r.rule === "call" && !r.anyOf.some((n) => callNames.has(n))) add(`requires-${r.anyOf[0]}`, "error", r.reason);
    if (r.rule === "new" && !r.anyOf.some((n) => newNames.has(n))) add(`requires-new-${r.anyOf[0]}`, "error", r.reason);
    if (r.rule === "fixture" && !fixtureNames.has(r.name)) add(`requires-fixture-${r.name}`, "error", r.reason);
    if (r.rule === "property" && !propertyNames.has(r.name)) add(`requires-${r.name}`, "error", r.reason);
    if (r.rule === "forbid-call") {
      for (const n of r.anyOf) if (callNames.has(n)) add(`forbid-${n}`, "error", r.reason, callNames.get(n));
    }
    if (r.rule === "forbid-text") {
      const m = new RegExp(r.pattern, "m").exec(code);
      if (m) {
        const lc = sf.getLineAndCharacterOfPosition(m.index);
        findings.push({ rule: "forbidden-pattern", severity: "error", message: r.reason, line: lc.line + 1, column: lc.character + 1 });
      }
    }
    if (r.rule === "require-text" && !new RegExp(r.pattern, "m").test(code)) add("required-pattern", "error", r.reason);
    if (r.rule === "min-tests" && testCount < r.count) add("min-tests", "error", r.reason || `This task needs at least ${r.count} tests; found ${testCount}.`);
  }

  // De-duplicate identical findings on the same line.
  const seen = new Set<string>();
  const unique = findings.filter((f) => {
    const k = `${f.rule}:${f.line}:${f.message}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return { findings: unique, testCount, rejected: unique.some((f) => f.severity === "reject"), playwrightImportRanges: pwRanges };
}

function shortText(n: ts.Node, sf: ts.SourceFile): string {
  const t = n.getText(sf).replace(/\s+/g, " ");
  return t.length > 60 ? t.slice(0, 57) + "…" : t;
}

/** Page-object classes may legitimately wrap CSS inside one place; still flagged, but same rule. */
function isLocatorChainedFromPageObject(_node: ts.CallExpression): boolean {
  return false;
}

function isLocatorExpr(expr: ts.Expression, locatorVars: Set<string>): boolean {
  let cur: ts.Expression = expr;
  while (ts.isParenthesizedExpression(cur) || ts.isNonNullExpression(cur) || ts.isAsExpression(cur)) cur = cur.expression;
  if (ts.isIdentifier(cur)) return locatorVars.has(cur.text);
  if (ts.isPropertyAccessExpression(cur) && !ts.isCallExpression(cur.parent)) {
    return locatorVars.has(cur.name.text);
  }
  if (ts.isCallExpression(cur)) {
    const n = calleeName(cur.expression);
    return n !== null && LOCATOR_FACTORIES.has(n);
  }
  return false;
}

/** Rewrites `from '@playwright/test'` to the hub wrapper (same length lines, so error lines stay exact). */
export function rewritePlaywrightImports(code: string, ranges: Array<{ start: number; end: number }>, target: string): string {
  let out = code;
  for (const r of [...ranges].sort((a, b) => b.start - a.start)) {
    out = out.slice(0, r.start) + target + out.slice(r.end);
  }
  return out;
}
