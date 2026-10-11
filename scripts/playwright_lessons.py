"""Topic-by-topic lessons for the Playwright track (consumed by gen_playwright_track.py).

runnable=True lessons have an `example` that passes against the app under test; the lab shows a
"Run example" button and the e2e suite runs every one of them.
"""

D = "https://playwright.dev/docs/"
I = "import { test, expect } from '@playwright/test';\n"
LESSONS = []


def lesson(**kw):
    kw.setdefault("runnable", True)
    kw.setdefault("teachAlong", [])
    kw.setdefault("pitfalls", [])
    LESSONS.append(kw)


lesson(
    id="pw-l01-setup", title="Why Playwright, and setting it up", topic="Setup",
    summary="Install Playwright Test, understand what `npm init playwright@latest` creates, and how the pieces fit: test runner, browsers, config, reports.",
    why="As a manual tester you already know what to check. Playwright Test is the runner that executes those checks in real Chromium, Firefox and WebKit, in parallel, with auto-waiting, traces and reports built in — no extra libraries to wire together.",
    body="Playwright Test (@playwright/test) bundles the runner, assertions (expect), fixtures and reporters. Browsers are downloaded separately with `npx playwright install` so their versions match the library exactly.\n\nA new project has: playwright.config.ts (where tests live, base URL, browsers = projects, retries, reporters), tests/ (your *.spec.ts files) and, after a run, playwright-report/ and test-results/ (traces, screenshots).\n\nIn this hub you never install anything: the runner container is the official mcr.microsoft.com/playwright image for the pinned version, and the app under test runs next to it.",
    objectives=["Know the three commands: init, install, test", "Recognise the generated files", "Know that browser versions are pinned to the Playwright version"],
    pitfalls=["Upgrading @playwright/test without re-running npx playwright install.", "Committing playwright-report/ and test-results/ — they are build output."],
    references=[{"title": "Installation", "url": D + "intro"}, {"title": "Running and debugging tests", "url": D + "running-tests"}, {"title": "Docker", "url": D + "docker"}],
    example={"language": "bash", "code": "# new project (choose TypeScript, tests folder, GitHub Actions workflow)\nnpm init playwright@latest\n\n# or add to an existing project\nnpm install -D @playwright/test@latest\nnpx playwright install --with-deps   # browsers + OS dependencies\n\nnpx playwright test                  # run all tests headless\nnpx playwright test --ui             # UI mode\nnpx playwright show-report           # open the HTML report\n"},
    runnable=False,
)

lesson(
    id="pw-l02-config", title="playwright.config.ts explained", topic="Setup",
    summary="The config decides where tests are, which browsers run (projects), the base URL, timeouts, retries, reporters and what to record (trace, screenshot, video).",
    why="Most 'it works locally but not in CI' problems are config problems. Reading the config is the fastest way to understand any Playwright repo you join.",
    body="defineConfig() gives you type-checked options. Top-level options apply to the runner (testDir, timeout, retries, workers, reporter). `use` sets defaults for fixtures (baseURL, trace, screenshot, viewport). `projects` run the same tests with different `use` settings — typically one per browser or device. `webServer` can start your app before the tests.\n\nThe Prerequisites panel in this lab shows the exact config the hub generates for every run.",
    objectives=["Find testDir, baseURL, projects, retries and reporter in a config", "Know the difference between top-level options and `use`", "Know what webServer does"],
    pitfalls=["Hard-coding full URLs in tests instead of baseURL.", "retries > 0 locally — it hides flakiness while you develop."],
    references=[{"title": "Test configuration", "url": D + "test-configuration"}, {"title": "Test use options", "url": D + "test-use-options"}, {"title": "Web server", "url": D + "test-webserver"}],
    example={"language": "typescript", "code": "import { defineConfig, devices } from '@playwright/test';\n\nexport default defineConfig({\n  testDir: './tests',\n  fullyParallel: true,\n  forbidOnly: !!process.env.CI,          // fail CI if someone commits test.only\n  retries: process.env.CI ? 2 : 0,\n  workers: process.env.CI ? 1 : undefined,\n  reporter: [['html'], ['list']],\n  use: {\n    baseURL: 'http://localhost:3000',\n    trace: 'on-first-retry',\n    screenshot: 'only-on-failure',\n  },\n  projects: [\n    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },\n    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },\n    // New in 1.64: keep a project configured but run it only when asked (--project=webkit)\n    { name: 'webkit', use: { ...devices['Desktop Safari'] }, default: false },\n  ],\n  webServer: {\n    command: 'npm run start',\n    url: 'http://localhost:3000',\n    reuseExistingServer: !process.env.CI,\n  },\n});\n"},
    runnable=False,
)

lesson(
    id="pw-l03-first-test", title="Your first test", topic="Basics",
    summary="test() declares a test, the { page } fixture gives you a fresh browser tab, and await expect(...) checks the result.",
    why="Every test you write has the same skeleton. Getting it right — async function, await on every action and assertion — avoids most beginner bugs.",
    body="Each test gets an isolated BrowserContext (like a fresh incognito window): no cookies or storage leak between tests. Actions (goto, click, fill) and web-first assertions return Promises, so you await them. Run this example with the Run button and open the trace to see every step with a DOM snapshot.",
    objectives=["Write test('title', async ({ page }) => { … })", "Use page.goto with a relative URL", "Await every action and assertion"],
    pitfalls=["Missing await — the test can finish before the check runs.", "Sharing state between tests through global variables."],
    references=[{"title": "Writing tests", "url": D + "writing-tests"}, {"title": "Test isolation", "url": D + "browser-contexts"}],
    teachAlong=["Run it.", "Open the trace → Actions tab → click each step to see the page at that moment."],
    example={"language": "typescript", "code": I + "\ntest('has title and heading', async ({ page }) => {\n  await page.goto('/');\n  await expect(page).toHaveTitle(/QA Practice Shop/);\n  await expect(page.getByRole('heading', { name: 'QA Practice Shop' })).toBeVisible();\n});\n\ntest('navigates to the login page', async ({ page }) => {\n  await page.goto('/');\n  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Login' }).click();\n  await expect(page).toHaveURL(/\\/login$/);\n});\n"},
)

lesson(
    id="pw-l04-locators", title="Locators and their priority order", topic="Locators",
    summary="Locators find elements the way users do. Prefer getByRole, then getByLabel, getByPlaceholder, getByText, getByAltText/getByTitle, then getByTestId; CSS/XPath last.",
    why="Tests that depend on ids, classes or DOM structure break on harmless refactors. User-facing locators only break when what the user sees changes — which is exactly when a test should fail.",
    body="A Locator is a recipe, not an element: it is resolved every time you use it, so it never goes stale, and it auto-waits. Locators are strict — if one matches several elements, actions throw so you notice. Narrow down by chaining (list.getByRole('listitem')) and filtering (filter({ hasText }), filter({ has })). New in 1.64: locator.within(parent) reads as 'this, within that'.\n\nUse getByTestId when there is no user-facing handle (a canvas, a dynamic id), and agree a data-testid convention with developers.",
    objectives=["Use getByRole with a name", "Chain and filter locators", "Know when getByTestId is the right choice"],
    pitfalls=["page.locator('.btn-primary') — tied to styling.", "Using .first()/.nth() to silence strictness instead of writing a better locator."],
    references=[{"title": "Locators", "url": D + "locators"}, {"title": "Best practices: locators", "url": D + "best-practices#use-locators"}, {"title": "locator.within() (1.64)", "url": D + "api/class-locator#locator-within"}, {"title": "Other locators (CSS/XPath)", "url": D + "other-locators"}],
    example={"language": "typescript", "code": I + "\ntest('locators in priority order', async ({ page }) => {\n  await page.goto('/login');\n  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();   // role + name\n  await page.getByLabel('Email').fill('qa@example.com');                        // form label\n  await expect(page.getByText('Practice account')).toBeVisible();              // visible text\n\n  await page.goto('/dashboard');\n  // redirected to login, because we are not signed in:\n  await expect(page.getByRole('alert')).toHaveText('Please sign in first');\n});\n\ntest('chaining and filtering', async ({ page }) => {\n  await page.goto('/products');\n  const rows = page.getByRole('row').filter({ has: page.getByRole('cell') });\n  await expect(rows).toHaveCount(12);\n  await expect(rows.filter({ hasText: 'Cheddar' })).toContainText('$9.90');\n});\n"},
)

lesson(
    id="pw-l05-actions", title="Actions: fill, click, check, select, press", topic="Basics",
    summary="Actions simulate a real user. Before each action Playwright waits until the element is visible, stable, enabled and receives events (actionability).",
    why="You never need manual waits before clicking: Playwright already checks that the element is ready, which removes a whole class of flaky failures.",
    body="Common actions: fill (replaces the value), pressSequentially (types key by key, for inputs that react to keys), click/dblclick, check/uncheck (and verify the new state), selectOption, press('Enter'), hover, setInputFiles, dragTo. All of them auto-wait for actionability checks.",
    objectives=["Use fill, check, selectOption and click", "Know what actionability checks do"],
    pitfalls=["Using click() on checkboxes and not verifying the state — check() does both.", "force: true to 'fix' a click — it hides real UI bugs."],
    references=[{"title": "Actions", "url": D + "input"}, {"title": "Auto-waiting / actionability", "url": D + "actionability"}],
    example={"language": "typescript", "code": I + "\ntest('fills the registration form', async ({ page }) => {\n  await page.goto('/register');\n  await page.getByLabel('Full name').fill('Ana Silva');\n  await page.getByLabel('Email').fill('ana@example.com');\n  await page.getByLabel('Age').fill('30');\n  await page.getByLabel('Country').selectOption('Australia');\n  await page.getByLabel('Pro').check();\n  await page.getByLabel('I accept the terms').check();\n  await page.getByRole('button', { name: 'Create account' }).click();\n  await expect(page.getByRole('status')).toHaveText('Account created for Ana Silva (Pro plan)');\n});\n"},
)

lesson(
    id="pw-l06-assertions", title="Web-first assertions & auto-waiting", topic="Assertions",
    summary="await expect(locator).toBeVisible()/toHaveText()/toHaveCount() retry until true or until the expect timeout (5 s by default).",
    why="Pages load asynchronously. A check that reads the DOM once (isVisible(), textContent(), count()) races the app; a web-first assertion waits for the expected state, so it is reliable without sleeps.",
    body="Web-first (async, retrying): toBeVisible, toBeHidden, toHaveText, toContainText, toHaveValue, toBeChecked, toHaveCount, toHaveAttribute, toHaveURL, toHaveTitle, toHaveScreenshot, toMatchAriaSnapshot, toBeOK.\nGeneric (sync, no retry): toBe, toEqual, toContain, toMatchObject — use them on plain values (API JSON).\n\nexpect.soft() records a failure but continues; expect.poll() retries any function; expect(...).toPass() retries a block. Never use page.waitForTimeout() in a real test.",
    objectives=["Pick a web-first matcher for a UI check", "Know when generic matchers are fine", "Use expect.poll for non-DOM values"],
    pitfalls=["expect(await locator.isVisible()).toBe(true) — no retry.", "expect(locator).toBeTruthy() — always passes.", "waitForTimeout(…) — slow and still flaky."],
    references=[{"title": "Assertions", "url": D + "test-assertions"}, {"title": "Auto-waiting", "url": D + "actionability"}, {"title": "Best practices: web-first assertions", "url": D + "best-practices#use-web-first-assertions"}],
    teachAlong=["The orders API answers after 250–1600 ms.", "toHaveCount keeps re-checking until 3 items exist.", "No sleep, no flake."],
    example={"language": "typescript", "code": I + "\ntest('waits for slow data without sleeping', async ({ page }) => {\n  await page.goto('/async');\n  await page.getByRole('button', { name: 'Load orders' }).click();\n  await expect(page.getByText('Loading orders…')).toBeVisible();\n  const orders = page.getByRole('list', { name: 'Orders' }).getByRole('listitem');\n  await expect(orders).toHaveCount(3);\n  await expect(orders).toContainText(['A-1001', 'A-1002', 'A-1003']);\n});\n\ntest('soft assertions and polling', async ({ page }) => {\n  await page.goto('/products');\n  await expect.soft(page.getByRole('status')).toHaveText('Showing 12 of 12 products');\n  await expect.poll(async () => (await page.request.get('/api/products?category=Fruit')).json())\n    .toMatchObject({ total: 4 });\n});\n"},
)

lesson(
    id="pw-l07-fixtures-hooks", title="Built-in fixtures & hooks", topic="Structure",
    summary="Fixtures (page, context, browser, request, browserName, baseURL…) are injected by name. Hooks (beforeEach, afterEach, beforeAll, afterAll) and describe group shared setup.",
    why="Fixtures give every test exactly what it needs, isolated and cleaned up automatically. Hooks are the automated version of preconditions and cleanup steps in your manual test cases.",
    body="Ask for fixtures by destructuring: async ({ page, request }) => …. `page` lives in its own `context`; `request` is an API client honouring baseURL. beforeEach runs before every test in its scope (file or describe). Prefer beforeEach + the page fixture over beforeAll with a shared page — shared state makes tests depend on each other. test.describe groups tests and can configure them (test.describe.configure({ mode: 'serial' }) when steps truly depend on each other).",
    objectives=["Destructure built-in fixtures", "Use beforeEach in a describe block", "Know why beforeAll + shared page is risky"],
    pitfalls=["Opening a page in beforeAll and reusing it across tests.", "Putting assertions in afterEach — failures there are confusing."],
    references=[{"title": "Fixtures", "url": D + "test-fixtures"}, {"title": "Test hooks", "url": D + "api/class-test#test-before-each"}, {"title": "Annotations & describe", "url": D + "test-annotations"}],
    example={"language": "typescript", "code": I + "\ntest.describe('todos page', () => {\n  test.beforeEach(async ({ page }) => {\n    await page.goto('/todos');\n  });\n\n  test('shows the seed todos', async ({ page }) => {\n    await expect(page.getByRole('list', { name: 'Todo list' }).getByRole('listitem')).toHaveCount(3);\n  });\n\n  test('adds a todo', async ({ page }) => {\n    await page.getByLabel('New todo').fill('Learn fixtures');\n    await page.getByRole('button', { name: 'Add' }).click();\n    await expect(page.getByText('Learn fixtures')).toBeVisible();\n  });\n});\n\ntest('uses the request fixture and baseURL', async ({ request, baseURL }) => {\n  expect(baseURL).toBeTruthy();\n  const res = await request.get('/api/health');\n  await expect(res).toBeOK();\n});\n"},
)

lesson(
    id="pw-l08-test-design", title="Test design: from manual test cases to automation", topic="Test design",
    summary="Turn test cases into tests: preconditions → fixtures/hooks, steps → actions, expected results → assertions. One behaviour per test, independent, named like the case.",
    why="Your manual QA experience is the hard part of automation: knowing what to test. This lesson maps that knowledge onto code so your suites stay readable and trustworthy.",
    body="Good automated tests are: independent (any order, any worker), deterministic (same input → same result), focused (one behaviour, several assertions about it are fine), readable (Arrange–Act–Assert, case ID in the title), and fast (set up data via API, not the UI).\n\nWhat to automate first: smoke paths, high-risk regressions, data-heavy checks. Keep exploratory and UX judgement manual.\n\nA useful layering: API tests for rules and contracts, a few UI tests per critical journey, visual tests for layout.",
    objectives=["Map a test case onto Arrange–Act–Assert", "Choose what to automate", "Keep tests independent"],
    pitfalls=["One giant end-to-end test covering 10 cases.", "Tests that depend on previous tests' data.", "Asserting only that 'no error happened'."],
    references=[{"title": "Best practices", "url": D + "best-practices"}, {"title": "Annotations (tags, skip, fixme)", "url": D + "test-annotations"}],
    example={"language": "typescript", "code": I + "\n// TC-LOGIN-001 — valid sign-in lands on the dashboard\ntest('TC-LOGIN-001 valid sign-in', { tag: '@smoke' }, async ({ page }) => {\n  // Arrange\n  await page.goto('/login');\n  // Act\n  await page.getByLabel('Email').fill('qa@example.com');\n  await page.getByLabel('Password').fill('Passw0rd!');\n  await page.getByRole('button', { name: 'Sign in' }).click();\n  // Assert\n  await expect(page).toHaveURL(/\\/dashboard$/);\n  await expect(page.getByText('Welcome, QA Tester')).toBeVisible();\n});\n\n// TC-LOGIN-002 — empty email is rejected\ntest('TC-LOGIN-002 empty email', async ({ page }) => {\n  await page.goto('/login');\n  await page.getByRole('button', { name: 'Sign in' }).click();\n  await expect(page.getByRole('alert')).toHaveText('Email is required');\n});\n"},
)

lesson(
    id="pw-l09-pom", title="Page Object Model", topic="Test design",
    summary="A page object wraps one page's locators and actions in a class, so tests read like steps and UI changes are fixed in one place.",
    why="Without page objects, a renamed button means editing every test. With them it is a one-line change, and tests become documentation of user journeys.",
    body="Create locators once in the constructor; expose intent-level methods (login, addTodo); keep most assertions in tests. Combine page objects with fixtures (next lesson) so tests receive them ready-made. Don't over-abstract: small helpers are fine; a page object per component is often better than one giant class.",
    objectives=["Write a page object with locators + methods", "Keep assertions in tests"],
    pitfalls=["Page objects that assert everything internally.", "Returning raw selectors (strings) instead of Locators."],
    references=[{"title": "Page object models", "url": D + "pom"}],
    example={"language": "typescript", "code": "import { test, expect, type Page, type Locator } from '@playwright/test';\n\nclass TodoPage {\n  readonly list: Locator;\n  readonly input: Locator;\n  constructor(readonly page: Page) {\n    this.list = page.getByRole('list', { name: 'Todo list' }).getByRole('listitem');\n    this.input = page.getByLabel('New todo');\n  }\n  async goto() {\n    await this.page.goto('/todos');\n  }\n  async add(title: string) {\n    await this.input.fill(title);\n    await this.page.getByRole('button', { name: 'Add' }).click();\n  }\n}\n\ntest('adds a todo via the page object', async ({ page }) => {\n  const todos = new TodoPage(page);\n  await todos.goto();\n  await todos.add('Write page objects');\n  await expect(todos.list).toHaveCount(4);\n  await expect(todos.list.last()).toHaveText('Write page objects');\n});\n"},
)

lesson(
    id="pw-l10-custom-fixtures", title="Custom fixtures", topic="Test design",
    summary="test.extend() creates your own fixtures: page objects, signed-in pages, seeded data — with setup before use() and teardown after.",
    why="Fixtures remove copy-pasted setup, run only when a test asks for them, and clean up even when the test fails.",
    body="Define fixtures with test.extend<{ todoPage: TodoPage }>({ todoPage: async ({ page }, use) => { …setup…; await use(value); …teardown… } }). Export the extended test from a fixtures file and import it in your specs. Worker-scoped fixtures ({ scope: 'worker' }) are created once per worker — useful for expensive resources like a test account. Option fixtures let projects pass values in config.",
    objectives=["Write a test-scoped fixture", "Know setup vs teardown around use()", "Know worker-scoped fixtures exist"],
    pitfalls=["Forgetting await use(...).", "Doing heavy work in a test-scoped fixture that could be worker-scoped."],
    references=[{"title": "Fixtures", "url": D + "test-fixtures"}, {"title": "Fixtures: worker scope", "url": D + "test-fixtures#worker-scoped-fixtures"}],
    example={"language": "typescript", "code": "import { test as base, expect } from '@playwright/test';\n\ntype Todo = { id: number; title: string };\n\n// Fixture that seeds a todo through the API and deletes it afterwards.\nconst test = base.extend<{ seededTodo: Todo }>({\n  seededTodo: async ({ page }, use) => {\n    const res = await page.request.post('/api/todos', { data: { title: 'Seeded by fixture' } });\n    const todo = (await res.json()) as Todo;\n    await use(todo);\n    await page.request.delete(`/api/todos/${todo.id}`); // teardown\n  },\n});\n\ntest('shows the seeded todo', async ({ page, seededTodo }) => {\n  await page.goto('/todos');\n  await expect(page.getByText(seededTodo.title)).toBeVisible();\n});\n"},
)

lesson(
    id="pw-l11-test-data", title="Test data strategies", topic="Test design",
    summary="Data-driven tests from arrays, unique data per test, API seeding, and keeping secrets out of code.",
    why="Most flaky suites are really data problems: tests sharing accounts or records, or depending on leftovers from earlier runs.",
    body="Generate one test per data row with a for…of loop (unique titles!). Create the data a test needs inside that test or a fixture (preferably via API), and make names unique (e.g. with testInfo.workerIndex or Date.now()) when tests run in parallel. Read credentials from environment variables, never commit them. For large datasets, keep JSON/CSV next to the tests and import it.",
    objectives=["Write a parameterized test", "Seed data via API", "Keep data unique per test"],
    pitfalls=["Hard-coded IDs that exist only on one environment.", "Several parallel tests editing the same record."],
    references=[{"title": "Parameterize tests", "url": D + "test-parameterize"}, {"title": "TestInfo (workerIndex, …)", "url": D + "api/class-testinfo"}],
    example={"language": "typescript", "code": I + "\nconst cases = [\n  { query: 'apple', expected: 1 },\n  { query: 'an', expected: 2 },\n  { query: 'zzz', expected: 0 },\n];\n\nfor (const { query, expected } of cases) {\n  test(`search \"${query}\" shows ${expected} result(s)`, async ({ page }) => {\n    await page.goto('/products');\n    await page.getByLabel('Search products').fill(query);\n    await expect(page.getByRole('row').filter({ has: page.getByRole('cell') })).toHaveCount(expected);\n  });\n}\n\ntest('unique data per worker', async ({ request }, testInfo) => {\n  const title = `todo-w${testInfo.workerIndex}-${Date.now()}`;\n  const res = await request.post('/api/todos', { data: { title } });\n  expect(res.status()).toBe(201);\n});\n"},
)

lesson(
    id="pw-l12-forms-tables", title="Forms, validation & tables", topic="UI patterns",
    summary="Assert validation messages and field state (toHaveValue, toBeChecked, toHaveAttribute('aria-invalid')), and check tables with row/cell locators and array matchers.",
    why="Forms and tables carry most business rules. Asserting the right state (not just 'no error') is what catches regressions.",
    body="For forms, test negative paths (each rule) and the positive path. Check field state with toHaveValue / toBeChecked / toBeDisabled. For tables, data rows are getByRole('row') with a cell; column headers are getByRole('columnheader'). toHaveText([...]) checks a whole list in order; aria-sort tells you the sort direction.",
    objectives=["Assert validation errors and field state", "Assert table rows and sort order"],
    references=[{"title": "Assertions", "url": D + "test-assertions"}, {"title": "Locator lists", "url": D + "locators#lists"}, {"title": "Aria snapshots", "url": D + "aria-snapshots"}],
    example={"language": "typescript", "code": I + "\ntest('sorting by name descending', async ({ page }) => {\n  await page.goto('/products');\n  await page.getByLabel('Category').selectOption('Fruit');\n  const name = page.getByRole('button', { name: 'Name' });\n  await name.click();\n  await name.click();\n  await expect(page.getByRole('columnheader', { name: 'Name' })).toHaveAttribute('aria-sort', 'descending');\n  // 1.64: locator.within() — the first cell of every row = the Name column\n  const nameColumn = page.getByRole('cell').first().within(page.getByRole('row'));\n  await expect(nameColumn).toHaveText(['Date', 'Cherry', 'Banana', 'Apple']);\n});\n\ntest('aria snapshot of the login form', async ({ page }) => {\n  await page.goto('/login');\n  await expect(page.getByRole('main')).toMatchAriaSnapshot(`\n    - heading \"Sign in\" [level=1]\n    - textbox \"Email\"\n    - textbox \"Password\"\n    - paragraph:\n      - button \"Sign in\"\n  `);\n  // Templates match a subsequence of children at each level: the button sits inside a <p>,\n  // so it must be nested under '- paragraph:'.\n});\n"},
)

lesson(
    id="pw-l13-dialogs", title="Native dialogs and modal dialogs", topic="UI patterns",
    summary="Native alert/confirm/prompt are auto-dismissed unless you handle the 'dialog' event. HTML modals are ordinary DOM — scope with getByRole('dialog').",
    why="'The delete button does nothing in automation' is almost always an unhandled confirm(). Knowing the difference saves hours.",
    body="Register page.once('dialog', d => d.accept()) (or d.dismiss(), d.accept('text') for prompt) before the action that opens it. Read d.message() to assert the text. For <dialog>/modals, locate with page.getByRole('dialog', { name }) and assert toBeVisible / toBeHidden.",
    objectives=["Accept and dismiss native dialogs", "Scope actions inside a modal"],
    pitfalls=["Handler registered after the click.", "page.on('dialog') left active for the whole test when only one dialog is expected."],
    references=[{"title": "Dialogs", "url": D + "dialogs"}],
    example={"language": "typescript", "code": I + "\ntest('dismissing confirm keeps the member', async ({ page }) => {\n  await page.goto('/dialogs');\n  page.once('dialog', async (dialog) => {\n    expect(dialog.message()).toBe('Delete Ben?');\n    await dialog.dismiss();\n  });\n  await page.getByRole('button', { name: 'Delete Ben' }).click();\n  await expect(page.getByRole('status')).toHaveText('Kept Ben');\n});\n\ntest('modal can be cancelled', async ({ page }) => {\n  await page.goto('/dialogs');\n  await page.getByRole('button', { name: 'Open settings' }).click();\n  const dialog = page.getByRole('dialog', { name: 'Settings' });\n  await expect(dialog).toBeVisible();\n  await dialog.getByRole('button', { name: 'Cancel' }).click();\n  await expect(dialog).toBeHidden();\n});\n"},
)

lesson(
    id="pw-l14-frames-tabs", title="iframes, new tabs and popups", topic="UI patterns",
    summary="Use locator.contentFrame() (or page.frameLocator) for iframes; capture new tabs with page.waitForEvent('popup') or context.waitForEvent('page').",
    why="Embedded payment forms, chat widgets and 'open in new tab' links are common and each needs one specific technique.",
    body="page.getByTitle('Payment form').contentFrame() returns a FrameLocator; every locator from it searches inside the iframe. For new tabs, start waiting before the click: const popupPromise = page.waitForEvent('popup'). The resolved value is a Page you test like any other.",
    objectives=["Locate inside an iframe", "Capture and test a new tab"],
    pitfalls=["Using page-level locators for elements inside an iframe.", "Not starting the wait before the click."],
    references=[{"title": "Frames", "url": D + "frames"}, {"title": "Pages: handling new pages and popups", "url": D + "pages"}],
    example={"language": "typescript", "code": I + "\ntest('validates the card number inside the iframe', async ({ page }) => {\n  await page.goto('/frames');\n  const payment = page.getByTitle('Payment form').contentFrame();\n  await payment.getByLabel('Card number').fill('1234');\n  await payment.getByRole('button', { name: 'Pay now' }).click();\n  await expect(payment.getByRole('status')).toHaveText('Card number must be 16 digits');\n});\n\ntest('help opens in a new tab', async ({ page, context }) => {\n  await page.goto('/newtab');\n  const pagePromise = context.waitForEvent('page');\n  await page.getByRole('link', { name: 'Open help center' }).click();\n  const help = await pagePromise;\n  await expect(help.getByRole('heading', { name: 'Help Center' })).toBeVisible();\n  expect(context.pages()).toHaveLength(2);\n});\n"},
)

lesson(
    id="pw-l15-uploads", title="Uploads and downloads", topic="UI patterns",
    summary="setInputFiles sets files on an <input type=file> (from disk or in-memory buffers); page.waitForEvent('download') captures downloads.",
    why="File flows are hard to test manually at scale (many files, odd names, sizes). In automation they are a few lines.",
    body="locator.setInputFiles(path | paths | { name, mimeType, buffer }); pass [] to clear. For a custom drop zone use locator.drop() (1.60+). For downloads: const downloadPromise = page.waitForEvent('download'); click; const download = await downloadPromise; await download.saveAs(...).",
    objectives=["Upload one and many in-memory files", "Know the download pattern"],
    references=[{"title": "Upload files", "url": D + "input#upload-files"}, {"title": "Downloads", "url": D + "downloads"}, {"title": "locator.drop()", "url": D + "api/class-locator#locator-drop"}],
    example={"language": "typescript", "code": I + "\ntest('uploads two files', async ({ page }) => {\n  await page.goto('/upload');\n  await page.getByLabel('Attachment').setInputFiles([\n    { name: 'a.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') },\n    { name: 'b.txt', mimeType: 'text/plain', buffer: Buffer.from('world!') },\n  ]);\n  await expect(page.getByRole('list', { name: 'Selected files' }).getByRole('listitem'))\n    .toHaveText(['a.txt (5 bytes)', 'b.txt (6 bytes)']);\n  await page.getByLabel('Attachment').setInputFiles([]);\n  await expect(page.getByRole('status')).toHaveText('No file selected');\n});\n"},
)

lesson(
    id="pw-l16-auth", title="Authentication: setup project + storageState", topic="Auth",
    summary="Log in once in a setup project, save cookies/localStorage with storageState, and start every other test already signed in.",
    why="UI login in every test is slow and makes the whole suite fail when login breaks. Saved state turns login into a one-time precondition.",
    body="Config: a 'setup' project with testMatch /.*\\.setup\\.ts/, and your browser projects with dependencies: ['setup'] and use: { storageState: 'playwright/.auth/user.json' }. The setup test logs in, waits for the post-login page, then calls page.context().storageState({ path }). Add playwright/.auth to .gitignore. For multiple roles, save one file per role and pick with test.use({ storageState }). API login (request.post + storageState) is even faster.\n\nThis lesson's lab runs with the hub's auth preset: auth.setup.ts below is provided and runs first.",
    objectives=["Configure a setup project and dependencies", "Save and reuse storageState", "Handle multiple roles"],
    pitfalls=["Saving state before the redirect completes.", "Tests that log out while sharing one saved session (they break each other)."],
    references=[{"title": "Authentication", "url": D + "auth"}, {"title": "Project dependencies", "url": D + "test-projects#dependencies"}],
    lab={"preset": "auth", "supportFiles": [{"path": "auth.setup.ts", "readOnly": True, "content": "import { test as setup, expect } from '@playwright/test';\n\nsetup('authenticate', async ({ page }) => {\n  await page.goto('/login');\n  await page.getByLabel('Email').fill('qa@example.com');\n  await page.getByLabel('Password').fill('Passw0rd!');\n  await page.getByRole('button', { name: 'Sign in' }).click();\n  await expect(page).toHaveURL(/\\/dashboard$/);\n  await page.context().storageState({ path: 'playwright/.auth/user.json' });\n});\n"}]},
    example={"language": "typescript", "code": I + "\ntest.use({ storageState: 'playwright/.auth/user.json' });\n\ntest('starts signed in', async ({ page }) => {\n  await page.goto('/dashboard');\n  await expect(page.getByText('Welcome, QA Tester')).toBeVisible();\n});\n\ntest.describe('as a signed-out visitor', () => {\n  test.use({ storageState: { cookies: [], origins: [] } });\n  test('is redirected to login', async ({ page }) => {\n    await page.goto('/dashboard');\n    await expect(page).toHaveURL(/\\/login/);\n  });\n});\n"},
)

lesson(
    id="pw-l17-api-testing", title="API testing with request", topic="API",
    summary="The request fixture (APIRequestContext) sends HTTP calls with baseURL, cookies and headers — for pure API tests and for seeding UI tests.",
    why="API checks are 10–100× faster than UI checks and pinpoint contract bugs (status codes, payloads) precisely.",
    body="request.get/post/put/patch/delete(url, { data, params, headers }). Assert with await expect(response).toBeOK() or status(), then parse await response.json(). Use page.request inside UI tests to share the browser's cookies. New in 1.64: apiRequestContext.addCookies()/cookies()/clearCookies().",
    objectives=["Write API tests with request", "Assert status codes and JSON", "Seed data for UI tests via API"],
    pitfalls=["Only asserting ok() — 200 vs 201 and the body matter.", "Leaving test data behind — delete what you create."],
    references=[{"title": "API testing", "url": D + "api-testing"}, {"title": "APIRequestContext", "url": D + "api/class-apirequestcontext"}],
    example={"language": "typescript", "code": I + "\ntest('products API filters by category', async ({ request }) => {\n  const res = await request.get('/api/products', { params: { category: 'Bakery' } });\n  await expect(res).toBeOK();\n  const body = await res.json();\n  expect(body.total).toBe(4);\n  expect(body.items.map((p: { name: string }) => p.name)).toContain('Sourdough');\n});\n\ntest('create then delete a todo', async ({ request }) => {\n  const created = await request.post('/api/todos', { data: { title: 'Temporary' } });\n  expect(created.status()).toBe(201);\n  const { id } = await created.json();\n  const deleted = await request.delete(`/api/todos/${id}`);\n  expect(deleted.status()).toBe(204);\n  const again = await request.delete(`/api/todos/${id}`);\n  expect(again.status()).toBe(404);\n});\n"},
)

lesson(
    id="pw-l18-mocking", title="Network mocking and interception", topic="Network",
    summary="page.route() intercepts requests: fulfill with fake data, modify a real response, abort, or delay — to test states the backend can't easily produce.",
    why="Empty states, errors, slow networks and third-party outages are where users get stuck — and they are hard to reproduce manually.",
    body="Register routes before navigation. route.fulfill({ json | body, status, headers }) answers immediately; route.fetch() gets the real response so you can tweak it; route.abort() simulates network failure; route.continue({ headers }) passes through with changes. context.route() applies to all pages; routeFromHAR() replays recorded traffic.",
    objectives=["Fulfill with mock data", "Modify a real response", "Simulate a failure"],
    pitfalls=["Routing after page.goto.", "Glob mismatch ('/api/todos' vs '**/api/todos')."],
    references=[{"title": "Mock APIs", "url": D + "mock"}, {"title": "Network", "url": D + "network"}, {"title": "Route", "url": D + "api/class-route"}],
    example={"language": "typescript", "code": I + "\ntest('modifies the real response', async ({ page }) => {\n  await page.route('**/api/todos', async (route) => {\n    const response = await route.fetch();\n    const json = await response.json();\n    json.todos.push({ id: 99, title: 'Injected by route', done: false });\n    await route.fulfill({ response, json });\n  });\n  await page.goto('/todos');\n  await expect(page.getByText('Injected by route')).toBeVisible();\n  await expect(page.getByText('3 items left')).toBeVisible();\n});\n\ntest('network failure shows the error state', async ({ page }) => {\n  await page.route('**/api/todos', (route) => route.abort());\n  await page.goto('/todos');\n  await expect(page.getByRole('alert')).toHaveText('Could not load todos. Please try again.');\n});\n"},
)

lesson(
    id="pw-l19-visual", title="Visual comparisons", topic="Visual",
    summary="expect(page|locator).toHaveScreenshot() compares against a stored baseline; mask, animations and maxDiffPixels make it stable.",
    why="Layout and styling bugs pass every text assertion. Visual checks catch them — if you control dynamic content.",
    body="First run writes the baseline (in 1.64, --update-snapshots=missing now passes the run). Later runs compare pixel-by-pixel with a configurable threshold. Mask dynamic regions, disable animations (default for toHaveScreenshot), and take baselines in the same OS/browser as CI (use the Playwright Docker image). Update intentionally with --update-snapshots. New in 1.64: expect.toHaveScreenshot.type: 'webp' in config for smaller files.",
    objectives=["Write a stable screenshot assertion", "Mask dynamic content", "Know how baselines are updated"],
    pitfalls=["Baselines from macOS compared on Linux CI.", "Screenshots of whole pages with live data."],
    references=[{"title": "Visual comparisons", "url": D + "test-snapshots"}, {"title": "PageAssertions.toHaveScreenshot", "url": D + "api/class-pageassertions#page-assertions-to-have-screenshot-1"}],
    example={"language": "typescript", "code": I + "\ntest('product table looks right', async ({ page }) => {\n  await page.goto('/products');\n  await expect(page.getByRole('table')).toHaveScreenshot('products-table.png');\n});\n\ntest('login form with tolerance', async ({ page }) => {\n  await page.goto('/login');\n  await expect(page.getByRole('main')).toHaveScreenshot('login.png', { maxDiffPixelRatio: 0.01 });\n});\n"},
)

lesson(
    id="pw-l20-debugging", title="Debugging: trace viewer, UI mode, codegen, inspector", topic="Debugging",
    summary="Trace viewer replays a run step by step; UI mode is a watch-mode IDE for tests; codegen records actions into code; the inspector steps through a test live.",
    why="Reading a trace is faster than re-running a test ten times. These tools turn 'it failed in CI' into 'it failed because the button was still disabled'.",
    body="Trace viewer: every run in this lab records a trace — open it from the results list. It shows actions, before/after DOM snapshots, console, network, source, and errors. Locally: npx playwright show-trace trace.zip, or drop it on trace.playwright.dev (runs fully in your browser).\nUI mode: npx playwright test --ui — pick tests, watch files, time-travel through steps.\nCodegen: npx playwright codegen <url> — records clicks into locator-based code (a starting point, then refactor).\nInspector: npx playwright test --debug, or await page.pause() in a test.\nVS Code extension: run/debug tests from the editor, pick locators.\n`npx playwright trace` (CLI) inspects traces from the terminal.",
    objectives=["Open and read a trace", "Use UI mode and codegen", "Pause a test with the inspector"],
    pitfalls=["Committing await page.pause().", "Keeping codegen output as-is (no assertions, brittle flow)."],
    references=[{"title": "Trace viewer", "url": D + "trace-viewer"}, {"title": "UI mode", "url": D + "test-ui-mode"}, {"title": "Codegen", "url": D + "codegen"}, {"title": "Debugging tests", "url": D + "debug"}, {"title": "VS Code extension", "url": D + "getting-started-vscode"}],
    example={"language": "bash", "code": "npx playwright test --ui                  # UI mode\nnpx playwright test --debug               # inspector, step through\nnpx playwright test --trace on            # force traces locally\nnpx playwright show-trace test-results/…/trace.zip\nnpx playwright codegen http://localhost:3000/login\n"},
    runnable=False,
)

lesson(
    id="pw-l21-flakiness", title="Flakiness and retries", topic="Reliability",
    summary="A flaky test passes and fails on the same code. Find it with --repeat-each, understand it with traces, fix the cause; use retries only as a CI safety net.",
    why="A suite people don't trust gets ignored. Every flaky test erodes trust in all the others.",
    body="Common causes: fixed sleeps, non-retrying checks, shared test data, order dependence, animations, real third-party services. Detect: --repeat-each=5, --shuffle (new in 1.64, random order), --fail-on-flaky-tests in CI. Retries: retries: 2 in CI marks a test that passes on retry as 'flaky' in the report — read those reports. trace: 'on-first-retry' records exactly the failing attempt.",
    objectives=["Reproduce flakiness with --repeat-each", "Read the 'flaky' status", "Fix root causes instead of adding retries"],
    pitfalls=["Raising timeouts to hide flakiness.", "Retries locally."],
    references=[{"title": "Test retries", "url": D + "test-retries"}, {"title": "Command line (--repeat-each, --shuffle)", "url": D + "test-cli"}, {"title": "Best practices", "url": D + "best-practices"}],
    example={"language": "bash", "code": "npx playwright test --repeat-each=5 --workers=4   # shake out flakes\nnpx playwright test --shuffle                     # 1.64: random order, prints the seed\nnpx playwright test --retries=2 --fail-on-flaky-tests\n"},
    runnable=False,
)

lesson(
    id="pw-l22-parallel", title="Parallelism and sharding", topic="Scale",
    summary="Workers run test files in parallel processes; fullyParallel parallelises tests within files; --shard splits a suite across CI machines; merge-reports combines the results.",
    why="A 40-minute suite blocks releases. Parallel workers on one machine and shards across machines bring it down to minutes.",
    body="Each worker is a separate process with its own browser; tests must be independent. test.describe.configure({ mode: 'parallel' | 'serial' }) overrides per file. New in 1.64: test.describe.configure({ lock: 'name' }) adds test locks so tests touching the same resource never overlap. Sharding: npx playwright test --shard=1/4 on 4 machines, with reporter 'blob', then npx playwright merge-reports to build one HTML report.",
    objectives=["Configure workers and fullyParallel", "Shard in CI and merge reports", "Use serial mode / locks only when needed"],
    pitfalls=["Tests sharing accounts/data under parallel workers.", "Using serial mode to hide dependencies between tests."],
    references=[{"title": "Parallelism", "url": D + "test-parallel"}, {"title": "Sharding", "url": D + "test-sharding"}, {"title": "Test locks (1.64)", "url": D + "test-parallel#test-locks"}],
    example={"language": "bash", "code": "# 4 machines in CI\nnpx playwright test --shard=1/4 --reporter=blob\n# … collect blob-report/ from every shard, then:\nnpx playwright merge-reports --reporter=html ./all-blob-reports\n"},
    runnable=False,
)

lesson(
    id="pw-l23-projects", title="Projects, browsers and devices", topic="Scale",
    summary="Projects run the same tests with different settings: browsers, mobile devices, locales, or setup/teardown stages via dependencies.",
    why="Cross-browser coverage is a config change, not new tests. Projects also give a clean way to run setup (auth, seeding) once.",
    body="projects: [{ name: 'chromium', use: devices['Desktop Chrome'] }, { name: 'Mobile Safari', use: devices['iPhone 15'] }]. Run one with --project=name. dependencies: ['setup'] orders projects; teardown: 'cleanup' runs after. New in 1.64: default: false keeps a project in the config without running it by default (run all with --project=\"*\"); device descriptors now also forward `screen`.",
    objectives=["Add browser and device projects", "Use project dependencies", "Use default: false (1.64)"],
    references=[{"title": "Projects", "url": D + "test-projects"}, {"title": "Emulation (devices)", "url": D + "emulation"}, {"title": "Browsers", "url": D + "browsers"}],
    example={"language": "typescript", "code": "import { defineConfig, devices } from '@playwright/test';\n\nexport default defineConfig({\n  projects: [\n    { name: 'setup', testMatch: /.*\\.setup\\.ts/ },\n    { name: 'chromium', use: { ...devices['Desktop Chrome'] }, dependencies: ['setup'] },\n    { name: 'mobile', use: { ...devices['Pixel 7'] }, dependencies: ['setup'] },\n    { name: 'webkit', use: { ...devices['Desktop Safari'] }, dependencies: ['setup'], default: false },\n  ],\n});\n"},
    runnable=False,
)

lesson(
    id="pw-l24-reporters", title="Reporters", topic="Reporting",
    summary="Built-in reporters: list, line, dot, html, json, junit, github, blob. Combine several; write a custom one when you need to push results elsewhere.",
    why="Reports are how the team sees results. JUnit feeds CI dashboards and test-management tools; HTML is for humans; blob is for sharding.",
    body="reporter: [['list'], ['html', { open: 'never' }], ['junit', { outputFile: 'results.xml' }]]. On GitHub Actions the 'github' reporter annotates failures inline. A custom reporter implements onBegin/onTestEnd/onEnd. This hub uses the json reporter to build the results panel you see in the lab.",
    objectives=["Configure multiple reporters", "Know which reporter fits which consumer"],
    references=[{"title": "Reporters", "url": D + "test-reporters"}, {"title": "Custom reporter API", "url": D + "api/class-reporter"}],
    example={"language": "typescript", "code": "import { defineConfig } from '@playwright/test';\n\nexport default defineConfig({\n  reporter: process.env.CI\n    ? [['github'], ['html', { open: 'never' }], ['junit', { outputFile: 'results/junit.xml' }]]\n    : [['list'], ['html']],\n});\n"},
    runnable=False,
)

lesson(
    id="pw-l25-ci", title="CI with GitHub Actions", topic="CI",
    summary="Run tests on every push/PR: install deps and browsers, run, upload the HTML report and traces as artifacts. Shard with a matrix for speed.",
    why="Tests only protect you if they run automatically before merge. CI is also where flakiness shows up first.",
    body="`npm init playwright@latest` can generate .github/workflows/playwright.yml. Key steps: actions/checkout, actions/setup-node, npm ci, npx playwright install --with-deps, npx playwright test, upload playwright-report/ with actions/upload-artifact (always, so failures keep evidence). Alternatively run inside the mcr.microsoft.com/playwright:v1.64.0-noble container to skip the browser install. Set retries and forbidOnly from process.env.CI.",
    objectives=["Write a GitHub Actions workflow", "Upload reports/traces as artifacts", "Shard with a matrix"],
    pitfalls=["Not uploading the report on failure (if: always()).", "Baselines for visual tests generated on a different OS than CI."],
    references=[{"title": "Continuous Integration", "url": D + "ci"}, {"title": "Setting up CI (GitHub Actions)", "url": D + "ci-intro"}, {"title": "Sharding in GitHub Actions", "url": D + "test-sharding#github-actions-example"}],
    example={"language": "yaml", "code": "name: Playwright Tests\non:\n  push: { branches: [main] }\n  pull_request: { branches: [main] }\njobs:\n  test:\n    timeout-minutes: 30\n    runs-on: ubuntu-latest\n    strategy:\n      fail-fast: false\n      matrix:\n        shard: [1/2, 2/2]\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-node@v4\n        with: { node-version: lts/* }\n      - run: npm ci\n      - run: npx playwright install --with-deps\n      - run: npx playwright test --shard=${{ matrix.shard }}\n      - uses: actions/upload-artifact@v4\n        if: ${{ !cancelled() }}\n        with:\n          name: playwright-report-${{ strategy.job-index }}\n          path: playwright-report/\n          retention-days: 30\n"},
    runnable=False,
)

lesson(
    id="pw-l26-component-testing", title="Component testing vs end-to-end", topic="Strategy",
    summary="E2E tests drive the real app in a browser. Component tests (experimental) mount a single React/Vue/Svelte component in a real browser for fast, focused checks.",
    why="Choosing the right level keeps suites fast: business rules in API/unit tests, component behaviour in component tests, critical user journeys in E2E.",
    body="Playwright component testing lives in @playwright/experimental-ct-react (and -vue, -svelte). It bundles your component with Vite and mounts it: const component = await mount(<Button title='Submit' />). It is still experimental — APIs can change between versions. For most QA-led suites, E2E + API tests cover the need; component tests are usually owned by front-end developers.",
    objectives=["Explain the difference between component and E2E tests", "Know CT is experimental", "Choose a test level for a scenario"],
    references=[{"title": "Components (experimental)", "url": D + "test-components"}],
    example={"language": "tsx", "code": "// tests/Button.spec.tsx  (npm init playwright@latest -- --ct)\nimport { test, expect } from '@playwright/experimental-ct-react';\nimport { Button } from '../src/Button';\n\ntest('calls onClick', async ({ mount }) => {\n  let clicked = false;\n  const component = await mount(<Button title=\"Submit\" onClick={() => { clicked = true; }} />);\n  await component.click();\n  expect(clicked).toBe(true);\n});\n"},
    runnable=False,
)

lesson(
    id="pw-l27-agents-mcp", title="Test agents, MCP and the CLI (AI-assisted testing)", topic="Ecosystem",
    summary="Playwright ships agent definitions (planner, generator, healer) via `npx playwright init-agents`, a bundled MCP server (`npx playwright mcp`), and `playwright-cli`. 1.64 adds WebMCP testing.",
    why="AI assistants can draft test plans and tests and propose fixes — useful for speed, but a QA engineer still decides what is worth testing and reviews every assertion.",
    body="Verified in the official release notes:\n• Playwright Agents (v1.56): planner explores the app and writes a Markdown test plan; generator turns it into tests; healer runs tests and proposes repairs. Set up with npx playwright init-agents --loop=vscode|claude|codex|copilot|opencode.\n• Playwright MCP (bundled since v1.62): npx playwright mcp starts the Model Context Protocol server so an AI client can drive a browser through accessibility snapshots; playwright-cli (v1.58+) offers a token-efficient command mode.\n• v1.64: page.webmcp / frame.webmcp test the tools a page registers through the experimental WebMCP browser API; Playwright MCP exposes them as webmcp_<tool>.\nTreat generated tests like codegen output: review locators, add meaningful assertions, check they fail when the app is broken (the gate in this lab does exactly that with planted bugs).",
    objectives=["Know what init-agents, mcp and cli provide", "Review AI-generated tests critically"],
    pitfalls=["Accepting generated tests that assert nothing meaningful.", "Letting a 'healer' change assertions to match a real bug."],
    references=[{"title": "Playwright Agents", "url": D + "test-agents"}, {"title": "Playwright MCP", "url": D + "getting-started-mcp"}, {"title": "Playwright CLI", "url": D + "getting-started-cli"}, {"title": "WebMCP API (1.64)", "url": D + "api/class-webmcp"}, {"title": "Release notes", "url": D + "release-notes"}],
    example={"language": "bash", "code": "npx playwright init-agents --loop=vscode   # planner / generator / healer definitions\nnpx playwright mcp                          # bundled MCP server\nnpx playwright cli --help                   # agent-friendly CLI\n"},
    runnable=False,
)

for _i, _l in enumerate(LESSONS, start=1):
    _l["order"] = _i
