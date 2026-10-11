#!/usr/bin/env python3
"""Generates tracks/playwright-typescript/ from playwright_lessons.py + playwright_tasks.py.

Edit the Python sources, then run:  python3 scripts/gen_playwright_track.py
The JSON output is committed so the APIs can serve it without Python at runtime.
"""
from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from playwright_lessons import LESSONS  # noqa: E402
from playwright_tasks import TASKS  # noqa: E402

ROOT = HERE.parent
TRACK_ID = "playwright-typescript"
OUT = ROOT / "tracks" / TRACK_ID
PLAYWRIGHT_VERSION = "1.64.0"
D = "https://playwright.dev/docs/"

HUB_CONFIG = """// The config the hub runner generates for every run (read-only here).
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 15_000,                 // per test
  expect: { timeout: 5_000 },      // per web-first assertion
  retries: 0,                      // the gate wants to SEE flakiness, not hide it
  workers: 1,
  updateSnapshots: 'missing',      // first visual run writes the baseline
  reporter: [['json', { outputFile: 'report.json' }]],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://pw-app:4000',  // the QA Practice Shop (app under test)
    trace: 'on',
    screenshot: 'on',
    actionTimeout: 5_000,
  },
  projects: [
    // auth tasks only: { name: 'setup', testMatch: /.*\\.setup\\.ts/ },
    { name: 'chromium', repeatEach: 3 /* tasks; lessons run once */ },
    // tasks only: 'mutant:<bug>' projects re-run your tests with a planted bug — they must FAIL there
  ],
});
"""

MANIFEST = {
    "id": TRACK_ID,
    "title": "Playwright · TypeScript",
    "kind": "playwright",
    "language": "typescript",
    "variant": "e2e",
    "runtime": "playwright",
    "api": "playwright",
    "order": 4,
    "icon": "🎭",
    "description": "UI + API test automation with Playwright Test — locators, web-first assertions, fixtures, POM, auth, mocking, visual, CI. Runs against a local practice app.",
    "playwrightVersion": PLAYWRIGHT_VERSION,
    "languages": ["typescript", "javascript"],
    "appUnderTest": {
        "name": "QA Practice Shop",
        "pages": ["/", "/login", "/register", "/products", "/todos", "/async", "/dialogs", "/frames", "/newtab", "/upload", "/dashboard"],
        "api": ["GET /api/products", "GET|POST /api/todos", "DELETE /api/todos/:id", "POST /api/login", "GET /api/me", "GET /api/orders (slow)"],
        "accounts": [{"email": "qa@example.com", "password": "Passw0rd!"}, {"email": "admin@example.com", "password": "Adm1n!pass"}],
    },
    "prerequisites": {
        "title": "Playwright Test setup (as the hub runs it)",
        "lockedByDefault": True,
        "install": f"npm init playwright@latest   # or: npm i -D @playwright/test@{PLAYWRIGHT_VERSION} && npx playwright install --with-deps",
        "code": HUB_CONFIG,
    },
    "runtimePanels": {
        "runner": {"title": "Test runner", "points": [
            "Each test gets a fresh BrowserContext (isolated cookies/storage).",
            "Actions auto-wait for actionability; web-first assertions retry.",
            "Workers are processes — tests must not share state.",
        ]},
        "gate": {"title": "How the gate checks you", "points": [
            "Static rules on your code (TypeScript AST): locators, awaits, sleeps, weak assertions, required APIs.",
            "Your tests run 3× — any mixed result is reported as flaky.",
            "The app is re-run with a planted bug; a good test must fail there.",
        ]},
        "ci": {"title": "CI & scale", "points": [
            "retries + trace: 'on-first-retry' in CI.",
            "--shard=i/n across machines, merge-reports after.",
            "Run in mcr.microsoft.com/playwright for identical browsers.",
        ]},
    },
    "references": [
        {"title": "Playwright docs", "url": D + "intro"},
        {"title": "Best practices", "url": D + "best-practices"},
        {"title": "Release notes", "url": D + "release-notes"},
    ],
    "lessonIds": [l["id"] for l in LESSONS],
    "taskIds": [t["id"] for t in TASKS],
}


def main() -> None:
    if OUT.exists():
        shutil.rmtree(OUT)
    (OUT / "lessons").mkdir(parents=True)
    (OUT / "tasks").mkdir(parents=True)
    (OUT / "manifest.json").write_text(json.dumps(MANIFEST, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    for l in LESSONS:
        (OUT / "lessons" / f"{l['id']}.json").write_text(json.dumps(l, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    for t in TASKS:
        data = {**t, "trackId": TRACK_ID}
        (OUT / "tasks" / f"{t['id']}.json").write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {len(LESSONS)} lessons and {len(TASKS)} tasks to {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
