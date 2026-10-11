"""Task definitions for the Playwright track (consumed by gen_playwright_track.py).

Every task carries:
  starterCode / solution (TypeScript), optional starterCodeJs / solutionJs,
  gate: static rules + run settings (repeatEach, mutants = app bugs a good test must catch),
  wrongSolutions: plausible mistakes + the gate rule each must trigger (used by the e2e test suite).
"""

D = "https://playwright.dev/docs/"
IMPORT = "import { test, expect } from '@playwright/test';\n"

LOGIN_PAGE = """import { type Page, type Locator } from '@playwright/test';

/** Page Object for /login. Locators live here once; tests read like the manual test case. */
export class LoginPage {
  readonly page: Page;
  readonly email: Locator;
  readonly password: Locator;
  readonly submit: Locator;
  readonly error: Locator;

  constructor(page: Page) {
    this.page = page;
    this.email = page.getByLabel('Email');
    this.password = page.getByLabel('Password');
    this.submit = page.getByRole('button', { name: 'Sign in' });
    this.error = page.getByRole('alert');
  }

  async goto() {
    await this.page.goto('/login');
  }

  async login(email: string, password: string) {
    await this.email.fill(email);
    await this.password.fill(password);
    await this.submit.click();
  }
}
"""

AUTH_SETUP = """import { test as setup, expect } from '@playwright/test';

const authFile = 'playwright/.auth/user.json';

setup('sign in once and save the session', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('qa@example.com');
  await page.getByLabel('Password').fill('Passw0rd!');
  await page.getByRole('button', { name: 'Sign in' }).click();
  // Wait until the login has really finished, otherwise the saved state may lack the cookie.
  await expect(page).toHaveURL(/\\/dashboard$/);
  await page.context().storageState({ path: authFile });
});
"""

DASHBOARD_SPEC = """import { test, expect } from '@playwright/test';

// Provided by the task: proves your setup saved a usable session.
test.use({ storageState: 'playwright/.auth/user.json' });

test('dashboard opens without logging in again', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\\/dashboard$/);
  await expect(page.getByText('Welcome, QA Tester')).toBeVisible();
});
"""

TASKS = []


def task(**kw):
    kw.setdefault("testFile", "learner.spec.ts")
    kw.setdefault("teachAlong", [])
    TASKS.append(kw)


# 1 ---------------------------------------------------------------------------
task(
    id="pw-01-first-test", title="Your first test",
    summary="Open the home page and check what a user sees first: the tab title and the main heading.",
    why="A first test proves the whole chain works (runner → browser → app → assertion). In manual QA this is your smoke check; automated, it runs on every change in seconds.",
    objectives=["Navigate with page.goto('/') (baseURL is configured for you)", "Assert the title with await expect(page).toHaveTitle(...)", "Assert the h1 with a role locator and toBeVisible()"],
    hints=["The exact title is 'Home · QA Practice Shop'.", "page.getByRole('heading', { name: 'QA Practice Shop', level: 1 })"],
    pitfalls=["Forgetting await on expect(...) — the test 'passes' before the check runs.", "expect(await page.title()).toBe(...) reads the title once and never retries."],
    references=[{"title": "Writing tests", "url": D + "writing-tests"}, {"title": "Assertions", "url": D + "test-assertions"}],
    teachAlong=["Cause: you await every step.", "Effect: Playwright reports the exact failing line if the title changes.", "Gate: runs your test 3× and checks the assertions are web-first."],
    starterCode=IMPORT + """
test('home page shows the shop name', async ({ page }) => {
  // 1. Open the home page ('/' — baseURL points at the app under test)

  // 2. Assert the tab title is 'Home · QA Practice Shop'

  // 3. Assert the main heading 'QA Practice Shop' is visible
});
""",
    solution=IMPORT + """
test('home page shows the shop name', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Home · QA Practice Shop');
  await expect(page.getByRole('heading', { name: 'QA Practice Shop', level: 1 })).toBeVisible();
});
""",
    gate={"requires": [
        {"rule": "call", "anyOf": ["toHaveTitle"], "reason": "Assert the tab title with await expect(page).toHaveTitle('Home · QA Practice Shop')."},
        {"rule": "call", "anyOf": ["getByRole"], "reason": "Find the heading the way a user (or screen reader) does: page.getByRole('heading', { name: … })."},
    ]},
    wrongSolutions=[
        {"label": "missing await on assertion", "expect": ["missing-await"], "code": IMPORT + """
test('home page shows the shop name', async ({ page }) => {
  await page.goto('/');
  expect(page).toHaveTitle('Home · QA Practice Shop');
  await expect(page.getByRole('heading', { name: 'QA Practice Shop', level: 1 })).toBeVisible();
});
"""},
        {"label": "non-retrying title check", "expect": ["non-retrying-assertion", "requires-toHaveTitle"], "code": IMPORT + """
test('home page shows the shop name', async ({ page }) => {
  await page.goto('/');
  expect(await page.title()).toBe('Home · QA Practice Shop');
  await expect(page.getByRole('heading', { name: 'QA Practice Shop', level: 1 })).toBeVisible();
});
"""},
        {"label": "wrong expected title", "expect": ["test-failed"], "code": IMPORT + """
test('home page shows the shop name', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('QA Practice Shop');
  await expect(page.getByRole('heading', { name: 'QA Practice Shop', level: 1 })).toBeVisible();
});
"""},
    ],
)

# 2 ---------------------------------------------------------------------------
LOGIN_CSS = IMPORT + """
// This test passes, but it is tied to markup details (ids, tags, nesting).
// Refactor every locator to a user-facing one: getByLabel / getByRole / getByText.
test('signs in with valid credentials', async ({ page }) => {
  await page.goto('/login');
  await page.locator('#email').fill('qa@example.com');
  await page.locator('#password').fill('Passw0rd!');
  await page.locator('form button[type=submit]').click();
  await expect(page.locator('main p:first-of-type')).toHaveText('Welcome, QA Tester');
});
"""
task(
    id="pw-02-locators", title="Locators: refactor to user-facing",
    summary="The starter test passes but uses CSS selectors. Refactor it to getByLabel / getByRole / getByText and also assert you landed on the dashboard.",
    why="Locators that read like the UI (label, role, accessible name) keep working when developers rename ids or restructure markup, and they double as a basic accessibility check.",
    objectives=["Use getByLabel for the Email and Password fields", "Use getByRole('button', { name: 'Sign in' })", "Assert the URL with toHaveURL and the greeting with getByText(...)"],
    hints=["Priority: getByRole → getByLabel → getByPlaceholder → getByText → getByAltText/getByTitle → getByTestId → CSS/XPath (last resort).", "await expect(page).toHaveURL(/\\/dashboard$/)"],
    pitfalls=["CSS such as 'form button[type=submit]' breaks the day a second form appears.", "Asserting only the URL: a broken greeting would slip through."],
    references=[{"title": "Locators", "url": D + "locators"}, {"title": "Best practices: user-facing attributes", "url": D + "best-practices#use-locators"}, {"title": "Other locators (CSS/XPath)", "url": D + "other-locators"}],
    teachAlong=["Cause: locators describe what a user sees.", "Effect: markup refactors don't break the test.", "Gate: CSS/XPath fail this task; the app is also run with planted bugs your assertions must catch."],
    starterCode=LOGIN_CSS,
    solution=IMPORT + """
test('signs in with valid credentials', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('qa@example.com');
  await page.getByLabel('Password').fill('Passw0rd!');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\\/dashboard$/);
  await expect(page.getByText('Welcome, QA Tester')).toBeVisible();
});
""",
    gate={"forbidCss": True, "requires": [
        {"rule": "call", "anyOf": ["getByLabel"], "reason": "Fill the fields by their visible label: page.getByLabel('Email') / page.getByLabel('Password')."},
        {"rule": "call", "anyOf": ["getByRole"], "reason": "Click the button by role and name: page.getByRole('button', { name: 'Sign in' })."},
        {"rule": "call", "anyOf": ["toHaveURL"], "reason": "Assert where the user lands: await expect(page).toHaveURL(/\\/dashboard$/)."},
    ], "mutants": [
        {"bug": "login-redirect", "reason": "after sign-in the app goes to the home page instead of the dashboard"},
        {"bug": "welcome-name", "reason": "the dashboard greets the user as 'Guest'"},
    ]},
    wrongSolutions=[
        {"label": "starter (CSS selectors)", "expect": ["prefer-user-facing-locators"], "code": LOGIN_CSS},
        {"label": "XPath button", "expect": ["prefer-user-facing-locators"], "code": IMPORT + """
test('signs in with valid credentials', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('qa@example.com');
  await page.getByLabel('Password').fill('Passw0rd!');
  await page.locator('//button[text()="Sign in"]').click();
  await expect(page).toHaveURL(/\\/dashboard$/);
  await expect(page.getByText('Welcome, QA Tester')).toBeVisible();
});
"""},
        {"label": "only checks the URL", "expect": ["weak-test"], "code": IMPORT + """
test('signs in with valid credentials', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('qa@example.com');
  await page.getByLabel('Password').fill('Passw0rd!');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\\/dashboard$/);
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
});
"""},
    ],
)

# 3 ---------------------------------------------------------------------------
ORDERS_FLAKY = IMPORT + """
// This test is flaky: the orders API answers in 250 ms, 1600 ms or 700 ms.
// Remove the fixed sleep and use web-first assertions that wait for the real condition.
test('loads the three orders', async ({ page }) => {
  await page.goto('/async');
  await page.getByRole('button', { name: 'Load orders' }).click();
  await page.waitForTimeout(1000); // "give it a second"
  expect(await page.getByRole('list', { name: 'Orders' }).getByRole('listitem').count()).toBe(3);
});
"""
task(
    id="pw-03-auto-waiting", title="Auto-waiting & web-first assertions",
    summary="Fix a flaky test: the orders list loads after a variable delay. Replace the sleep and the one-shot count with web-first assertions.",
    why="Most 'flaky automation' comes from sleeping for a guessed time. Web-first assertions retry until the condition is true (or the timeout hits), so they are both fast and reliable.",
    objectives=["Delete waitForTimeout", "await expect(list items).toHaveCount(3)", "Assert the status text 'Loaded 3 orders'"],
    hints=["const orders = page.getByRole('list', { name: 'Orders' }).getByRole('listitem');", "await expect(orders).toHaveCount(3);"],
    pitfalls=["expect(await locator.count()).toBe(3) reads once — no retry.", "Raising the sleep 'fixes' it on your machine and slows every run."],
    references=[{"title": "Auto-waiting (actionability)", "url": D + "actionability"}, {"title": "Web-first assertions", "url": D + "test-assertions"}, {"title": "Best practices: web-first assertions", "url": D + "best-practices#use-web-first-assertions"}],
    teachAlong=["Cause: the API delay varies per request.", "Effect: a fixed sleep passes some runs and fails others.", "Gate: runs your test 3 times; the 2nd run gets the 1.6 s response."],
    starterCode=ORDERS_FLAKY,
    solution=IMPORT + """
test('loads the three orders', async ({ page }) => {
  await page.goto('/async');
  await page.getByRole('button', { name: 'Load orders' }).click();
  const orders = page.getByRole('list', { name: 'Orders' }).getByRole('listitem');
  await expect(orders).toHaveCount(3);
  await expect(page.getByText('Loaded 3 orders')).toBeVisible();
  await expect(orders.first()).toContainText('A-1001');
});
""",
    gate={"requires": [
        {"rule": "call", "anyOf": ["toHaveCount"], "reason": "Check the number of orders with await expect(orders).toHaveCount(3) — it retries until the list is rendered."},
    ], "mutants": [{"bug": "orders-empty", "reason": "the orders never finish loading"}]},
    wrongSolutions=[
        {"label": "starter (sleep + one-shot count)", "expect": ["no-wait-for-timeout", "non-retrying-assertion", "flaky"], "code": ORDERS_FLAKY},
        {"label": "truthy locator", "expect": ["weak-assertion"], "code": IMPORT + """
test('loads the three orders', async ({ page }) => {
  await page.goto('/async');
  await page.getByRole('button', { name: 'Load orders' }).click();
  const orders = page.getByRole('list', { name: 'Orders' }).getByRole('listitem');
  expect(orders).toBeTruthy();
  await expect(orders).toHaveCount(3);
});
"""},
    ],
)

# 4 ---------------------------------------------------------------------------
FORM_HAPPY_ONLY = IMPORT + """
test('creates an account', async ({ page }) => {
  await page.goto('/register');
  await page.getByLabel('Full name').fill('Ana Silva');
  await page.getByLabel('Email').fill('ana@example.com');
  await page.getByLabel('Age').fill('30');
  await page.getByLabel('Country').selectOption('Nepal');
  await page.getByLabel('Pro').check();
  await page.getByLabel('I accept the terms').check();
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('status')).toHaveText('Account created for Ana Silva (Pro plan)');
});
"""
task(
    id="pw-04-forms", title="Forms & validation",
    summary="Cover the registration form like a tester: one negative test (empty submit shows every error) and one positive test (valid data creates the account).",
    why="Validation rules are where manual testers find most bugs. Automating both the negative and the positive path stops regressions on either side.",
    objectives=["Negative: submit empty → 'Full name is required', 'Enter a valid email address', 'Age must be between 18 and 120', 'You must accept the terms'", "Positive: fill, selectOption, check radio + checkbox → success message", "At least 2 tests"],
    hints=["Radio and checkbox: page.getByLabel('Pro').check()", "Select: page.getByLabel('Country').selectOption('Nepal')", "Errors are plain text: page.getByText('Full name is required')"],
    pitfalls=["Testing only the happy path — a form that stops validating still passes.", "Using fill() on a checkbox (use check())."],
    references=[{"title": "Actions: text input, checkboxes, select", "url": D + "input"}, {"title": "Assertions: toHaveText / toBeChecked", "url": D + "test-assertions"}],
    teachAlong=["Cause: one negative + one positive test.", "Effect: a form that stops validating is caught.", "Gate: the app is re-run with validation switched off — your negative test must fail there."],
    starterCode=IMPORT + """
test('shows every validation error on an empty submit', async ({ page }) => {
  await page.goto('/register');
  // submit without filling anything, then assert each error message
});

test('creates an account with valid data', async ({ page }) => {
  await page.goto('/register');
  // fill name, email, age, country, choose the Pro plan, accept terms, submit
  // assert the status message 'Account created for Ana Silva (Pro plan)'
});
""",
    solution=IMPORT + """
test('shows every validation error on an empty submit', async ({ page }) => {
  await page.goto('/register');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText('Full name is required')).toBeVisible();
  await expect(page.getByText('Enter a valid email address')).toBeVisible();
  await expect(page.getByText('Age must be between 18 and 120')).toBeVisible();
  await expect(page.getByText('You must accept the terms')).toBeVisible();
  await expect(page.getByLabel('Full name')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByRole('status')).toHaveText('');
});

test('creates an account with valid data', async ({ page }) => {
  await page.goto('/register');
  await page.getByLabel('Full name').fill('Ana Silva');
  await page.getByLabel('Email').fill('ana@example.com');
  await page.getByLabel('Age').fill('30');
  await page.getByLabel('Country').selectOption('Nepal');
  await page.getByLabel('Pro').check();
  await page.getByLabel('I accept the terms').check();
  await expect(page.getByLabel('I accept the terms')).toBeChecked();
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('status')).toHaveText('Account created for Ana Silva (Pro plan)');
});
""",
    gate={"forbidCss": True, "minTests": 2, "requires": [
        {"rule": "call", "anyOf": ["selectOption"], "reason": "Choose the country with page.getByLabel('Country').selectOption('Nepal')."},
        {"rule": "call", "anyOf": ["check", "setChecked"], "reason": "Tick the radio/checkbox with .check() (not click or fill) so Playwright verifies the new state."},
    ], "mutants": [{"bug": "form-no-validation", "reason": "the form accepts empty and invalid input"}]},
    wrongSolutions=[
        {"label": "happy path only", "expect": ["min-tests", "weak-test"], "code": FORM_HAPPY_ONLY},
        {"label": "legacy selector API", "expect": ["prefer-user-facing-locators"], "code": FORM_HAPPY_ONLY.replace("await page.getByLabel('Full name').fill('Ana Silva');", "await page.fill('#name', 'Ana Silva');")},
    ],
)

# 5 ---------------------------------------------------------------------------
TC_TEXT = """/*
 Manual test case TC-LOGIN-003 — Sign-in with a wrong password
 Preconditions: user qa@example.com exists
 Steps:
   1. Open /login
   2. Enter email qa@example.com and password 'wrong'
   3. Click 'Sign in'
 Expected:
   a. Error 'Invalid email or password' is shown
   b. The user stays on the login page
   c. The email field keeps 'qa@example.com'; the password field is empty
*/
"""
task(
    id="pw-05-test-case-to-test", title="From manual test case to automated test",
    summary="Turn the manual test case TC-LOGIN-003 into one automated test that checks every expected result. Keep the ID in the test title for traceability.",
    why="You already write good test cases. Automation is the same thinking: preconditions → Arrange, steps → Act, expected results → Assert. Keeping the case ID in the title links reports back to your test management tool.",
    objectives=["Title starts with 'TC-LOGIN-003'", "Arrange / Act / Assert sections", "Assert all three expected results (a, b, c)"],
    hints=["Field values: await expect(page.getByLabel('Email')).toHaveValue('qa@example.com')", "Empty password: toHaveValue('') or toBeEmpty()", "URL: toHaveURL(/\\/login/)"],
    pitfalls=["Automating the steps but only one expected result.", "One giant test that covers several test cases — keep one behaviour per test."],
    references=[{"title": "Best practices", "url": D + "best-practices"}, {"title": "Test annotations & titles", "url": D + "test-annotations"}],
    teachAlong=["Cause: each expected result becomes an assertion.", "Effect: a regression in any of a/b/c fails the test with a clear line.", "Gate: checks the ID in the title and the field-value assertions."],
    starterCode=IMPORT + "\n" + TC_TEXT + """
test('TC-LOGIN-003 wrong password shows an error', async ({ page }) => {
  // Arrange

  // Act

  // Assert (a, b, c)
});
""",
    solution=IMPORT + "\n" + TC_TEXT + """
test('TC-LOGIN-003 wrong password shows an error', async ({ page }) => {
  // Arrange
  await page.goto('/login');

  // Act
  await page.getByLabel('Email').fill('qa@example.com');
  await page.getByLabel('Password').fill('wrong');
  await page.getByRole('button', { name: 'Sign in' }).click();

  // Assert
  await expect(page.getByRole('alert')).toHaveText('Invalid email or password');
  await expect(page).toHaveURL(/\\/login/);
  await expect(page.getByLabel('Email')).toHaveValue('qa@example.com');
  await expect(page.getByLabel('Password')).toHaveValue('');
});
""",
    gate={"forbidCss": True, "requires": [
        {"rule": "require-text", "pattern": "test\\(\\s*['\"`]TC-LOGIN-003", "reason": "Start the test title with the case ID 'TC-LOGIN-003' so reports trace back to the manual test case."},
        {"rule": "call", "anyOf": ["toHaveValue", "toBeEmpty"], "reason": "Expected result (c) is about field values — assert them with toHaveValue(...)."},
        {"rule": "call", "anyOf": ["toHaveURL"], "reason": "Expected result (b): assert the user stays on /login with toHaveURL(/\\/login/)."},
    ]},
    wrongSolutions=[
        {"label": "only checks the error message", "expect": ["requires-toHaveValue", "requires-toHaveURL"], "code": IMPORT + """
test('TC-LOGIN-003 wrong password shows an error', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('qa@example.com');
  await page.getByLabel('Password').fill('wrong');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert')).toHaveText('Invalid email or password');
});
"""},
        {"label": "missing case ID + wrong expected text", "expect": ["required-pattern", "test-failed"], "code": IMPORT + """
test('wrong password', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('qa@example.com');
  await page.getByLabel('Password').fill('wrong');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert')).toHaveText('Wrong password');
  await expect(page).toHaveURL(/\\/login/);
  await expect(page.getByLabel('Email')).toHaveValue('qa@example.com');
});
"""},
    ],
)

# 6 ---------------------------------------------------------------------------
TABLE_NO_HOOK = IMPORT + """
test.describe('product table', () => {
  test('filters by category', async ({ page }) => {
    await page.goto('/products');
    await page.getByLabel('Category').selectOption('Dairy');
    await expect(page.getByRole('status')).toHaveText('Showing 4 of 12 products');
  });

  test('sorts by price', async ({ page }) => {
    await page.goto('/products');
    await page.getByRole('button', { name: 'Price' }).click();
    const rows = page.getByRole('row').filter({ has: page.getByRole('cell') });
    await expect(rows.first()).toContainText('Banana');
  });
});
"""
task(
    id="pw-06-hooks-tables", title="Hooks, describe & tables",
    summary="Group two table tests in test.describe, move the shared navigation into test.beforeEach, and check filtering (category + search) and sorting.",
    why="Hooks remove duplicated setup and make each test start from the same known state — the automated version of a test precondition.",
    objectives=["test.describe('product table', …) with a test.beforeEach that opens /products", "Filter: Category 'Dairy' → 'Showing 4 of 12 products'; search 'ch' → only Cheddar", "Sort: click 'Price' → first row Banana, aria-sort ascending; click again → Cheddar first"],
    hints=["Data rows only: page.getByRole('row').filter({ has: page.getByRole('cell') })", "await expect(page.getByRole('columnheader', { name: 'Price' })).toHaveAttribute('aria-sort', 'ascending')"],
    pitfalls=["beforeAll with a shared page couples tests — prefer beforeEach + the page fixture.", "Counting rows including the header row."],
    references=[{"title": "Test hooks & describe", "url": D + "api/class-test#test-before-each"}, {"title": "Locators: filtering", "url": D + "locators#filtering-locators"}, {"title": "Locator lists", "url": D + "locators#lists"}],
    teachAlong=["Cause: beforeEach runs before every test in the describe.", "Effect: each test is independent and can run alone or in parallel.", "Gate: planted bugs break sorting and searching — your tests must notice both."],
    starterCode=TABLE_NO_HOOK,
    solution=IMPORT + """
test.describe('product table', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/products');
  });

  test('filters by category and search text', async ({ page }) => {
    const rows = page.getByRole('row').filter({ has: page.getByRole('cell') });
    await page.getByLabel('Category').selectOption('Dairy');
    await expect(page.getByRole('status')).toHaveText('Showing 4 of 12 products');
    await expect(rows).toHaveCount(4);
    await page.getByLabel('Search products').fill('ch');
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText('Cheddar');
  });

  test('sorts by price both ways', async ({ page }) => {
    const rows = page.getByRole('row').filter({ has: page.getByRole('cell') });
    const price = page.getByRole('columnheader', { name: 'Price' });
    await page.getByRole('button', { name: 'Price' }).click();
    await expect(price).toHaveAttribute('aria-sort', 'ascending');
    await expect(rows.first()).toContainText('Banana');
    await page.getByRole('button', { name: 'Price' }).click();
    await expect(price).toHaveAttribute('aria-sort', 'descending');
    await expect(rows.first()).toContainText('Cheddar');
  });
});
""",
    gate={"forbidCss": True, "minTests": 2, "requires": [
        {"rule": "call", "anyOf": ["describe"], "reason": "Group the tests with test.describe('product table', () => { … })."},
        {"rule": "call", "anyOf": ["beforeEach"], "reason": "Move the shared page.goto('/products') into test.beforeEach — the automated precondition."},
    ], "mutants": [
        {"bug": "sort-broken", "reason": "clicking a column header no longer sorts"},
        {"bug": "filter-broken", "reason": "the search box is ignored"},
    ]},
    wrongSolutions=[
        {"label": "duplicated setup, no hook, misses the search bug", "expect": ["requires-beforeEach", "weak-test"], "code": TABLE_NO_HOOK},
    ],
)

# 7 ---------------------------------------------------------------------------
DIALOG_NO_HANDLER = IMPORT + """
test('deletes a team member after confirming', async ({ page }) => {
  await page.goto('/dialogs');
  await page.getByRole('button', { name: 'Delete Ana' }).click();
  await expect(page.getByRole('status')).toHaveText('Deleted Ana');
});

test('saves settings in the modal', async ({ page }) => {
  await page.goto('/dialogs');
  await page.getByRole('button', { name: 'Open settings' }).click();
  const dialog = page.getByRole('dialog', { name: 'Settings' });
  await dialog.getByLabel('Email notifications').check();
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('status')).toHaveText('Settings saved (notifications on)');
});
"""
task(
    id="pw-07-dialogs", title="Native dialogs & modals",
    summary="Accept a native confirm() to delete a team member, and drive an in-page modal dialog.",
    why="Playwright auto-dismisses native dialogs (alert/confirm/prompt) unless you handle them — a classic 'works manually, fails in automation' trap. Modals, on the other hand, are normal DOM you scope with getByRole('dialog').",
    objectives=["Register page.once('dialog', d => d.accept()) before clicking Delete", "Assert 'Deleted Ana' and that Ana's row is gone", "Open Settings, tick the checkbox inside the dialog, Save, and assert the dialog closes"],
    hints=["page.once('dialog', (dialog) => dialog.accept());", "await expect(page.getByRole('listitem').filter({ hasText: 'Ana' })).toHaveCount(0)", "await expect(dialog).toBeHidden()"],
    pitfalls=["Registering the dialog handler after the click — the dialog has already been dismissed.", "Asserting only the status text: a delete that doesn't remove the row slips through."],
    references=[{"title": "Dialogs", "url": D + "dialogs"}, {"title": "getByRole", "url": D + "api/class-page#page-get-by-role"}],
    teachAlong=["Cause: without a handler Playwright dismisses confirm().", "Effect: the app reads 'Cancel' and keeps Ana.", "Gate: a planted bug keeps the row after delete — check the row really disappears."],
    starterCode=DIALOG_NO_HANDLER,
    solution=IMPORT + """
test('deletes a team member after confirming', async ({ page }) => {
  await page.goto('/dialogs');
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Delete Ana' }).click();
  await expect(page.getByRole('status')).toHaveText('Deleted Ana');
  await expect(page.getByRole('list', { name: 'Team members' }).getByRole('listitem').filter({ hasText: 'Ana' })).toHaveCount(0);
});

test('saves settings in the modal', async ({ page }) => {
  await page.goto('/dialogs');
  await page.getByRole('button', { name: 'Open settings' }).click();
  const dialog = page.getByRole('dialog', { name: 'Settings' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Email notifications').check();
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('status')).toHaveText('Settings saved (notifications on)');
});
""",
    gate={"forbidCss": True, "minTests": 2, "requires": [
        {"rule": "call", "anyOf": ["once", "on", "waitForEvent"], "reason": "Handle the native confirm(): page.once('dialog', (dialog) => dialog.accept()) before clicking Delete."},
    ], "mutants": [
        {"bug": "dialog-noop", "reason": "confirming a delete does not remove the row"},
        {"bug": "settings-noop", "reason": "the Settings dialog Save button does nothing"},
    ]},
    wrongSolutions=[
        {"label": "no dialog handler", "expect": ["requires-once", "test-failed"], "code": DIALOG_NO_HANDLER},
    ],
)

# 8 ---------------------------------------------------------------------------
NEWTAB_TEST = """
test('opens the help center in a new tab', async ({ page }) => {
  await page.goto('/newtab');
  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('link', { name: 'Open help center' }).click();
  const help = await popupPromise;
  await expect(help).toHaveURL(/\\/help$/);
  await expect(help.getByRole('heading', { name: 'Help Center' })).toBeVisible();
});
"""
task(
    id="pw-08-frames-tabs", title="iframes & new tabs",
    summary="Pay inside the 'Payment form' iframe, then follow a link that opens the help center in a new tab.",
    why="Payment widgets and help links are everyday features that need special handling: elements inside an iframe are invisible to page-level locators, and a new tab is a new Page object you must capture.",
    objectives=["Reach the iframe with page.getByTitle('Payment form').contentFrame()", "Pay with 4242 4242 4242 4242 and assert the confirmation inside the frame", "Capture the new tab with page.waitForEvent('popup') started before the click"],
    hints=["const popupPromise = page.waitForEvent('popup'); await link.click(); const help = await popupPromise;", "Assertions on the new tab use the new page: expect(help.getByRole('heading', …))"],
    pitfalls=["Locating the card field on page instead of the frame → 'element not found'.", "Awaiting the click before starting waitForEvent — the popup can be missed."],
    references=[{"title": "Frames", "url": D + "frames"}, {"title": "Pages & new tabs (popups)", "url": D + "pages#handling-popups"}, {"title": "locator.contentFrame()", "url": D + "api/class-locator#locator-content-frame"}],
    teachAlong=["Cause: the iframe is a separate document.", "Effect: you locate inside it via contentFrame().", "Gate: planted bugs decline the card and break the help page heading."],
    starterCode=IMPORT + """
test('pays inside the payment iframe', async ({ page }) => {
  await page.goto('/frames');
  // locate the iframe by its title, fill 'Card number', click 'Pay now', assert the status
});

test('opens the help center in a new tab', async ({ page }) => {
  await page.goto('/newtab');
  // wait for the popup while clicking 'Open help center', then assert on the new page
});
""",
    solution=IMPORT + """
test('pays inside the payment iframe', async ({ page }) => {
  await page.goto('/frames');
  const payment = page.getByTitle('Payment form').contentFrame();
  await payment.getByLabel('Card number').fill('4242 4242 4242 4242');
  await payment.getByRole('button', { name: 'Pay now' }).click();
  await expect(payment.getByRole('status')).toHaveText('Payment accepted for card ending 4242');
});
""" + NEWTAB_TEST,
    gate={"forbidCss": True, "minTests": 2, "requires": [
        {"rule": "call", "anyOf": ["contentFrame", "frameLocator"], "reason": "Elements inside an iframe need a frame locator: page.getByTitle('Payment form').contentFrame()."},
        {"rule": "call", "anyOf": ["waitForEvent"], "reason": "Capture the new tab with const popup = page.waitForEvent('popup') before clicking the link."},
    ], "mutants": [
        {"bug": "frame-declined", "reason": "the payment iframe declines every card"},
        {"bug": "newtab-wrong", "reason": "the help link opens a page with the wrong heading"},
    ]},
    wrongSolutions=[
        {"label": "ignores the iframe", "expect": ["requires-contentFrame", "test-failed"], "code": IMPORT + """
test('pays inside the payment iframe', async ({ page }) => {
  await page.goto('/frames');
  await page.getByLabel('Card number').fill('4242 4242 4242 4242');
  await page.getByRole('button', { name: 'Pay now' }).click();
});
""" + NEWTAB_TEST},
        {"label": "CSS frame selector", "expect": ["prefer-user-facing-locators"], "code": IMPORT + """
test('pays inside the payment iframe', async ({ page }) => {
  await page.goto('/frames');
  const payment = page.frameLocator('iframe[title="Payment form"]');
  await payment.getByLabel('Card number').fill('4242 4242 4242 4242');
  await payment.getByRole('button', { name: 'Pay now' }).click();
  await expect(payment.getByRole('status')).toHaveText('Payment accepted for card ending 4242');
});
""" + NEWTAB_TEST},
    ],
)

# 9 ---------------------------------------------------------------------------
task(
    id="pw-09-upload", title="File upload",
    summary="Upload an in-memory CSV through the 'Attachment' input and check the file list.",
    why="Upload flows are common in QA scope (reports, avatars, imports). setInputFiles sets files directly — no OS file picker — and can build the file in memory so the test needs no fixtures on disk.",
    objectives=["page.getByLabel('Attachment').setInputFiles({ name, mimeType, buffer })", "Assert the list shows 'report.csv (17 bytes)'", "Assert the status '1 file(s) ready'"],
    hints=["buffer: Buffer.from('id,result\\n1,pass\\n') is 17 bytes", "toHaveText([...]) on a list locator checks every item in order"],
    pitfalls=["Clicking the input to open the native picker — automation can't drive OS dialogs.", "Checking a locator is truthy instead of checking the text."],
    references=[{"title": "Upload files", "url": D + "input#upload-files"}, {"title": "locator.setInputFiles()", "url": D + "api/class-locator#locator-set-input-files"}],
    starterCode=IMPORT + """
test('uploads a CSV report', async ({ page }) => {
  await page.goto('/upload');
  // set an in-memory file on the 'Attachment' input and assert the result
});
""",
    solution=IMPORT + """
test('uploads a CSV report', async ({ page }) => {
  await page.goto('/upload');
  await page.getByLabel('Attachment').setInputFiles({
    name: 'report.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('id,result\\n1,pass\\n'),
  });
  await expect(page.getByRole('list', { name: 'Selected files' }).getByRole('listitem')).toHaveText(['report.csv (17 bytes)']);
  await expect(page.getByRole('status')).toHaveText('1 file(s) ready');
});
""",
    gate={"forbidCss": True, "requires": [
        {"rule": "call", "anyOf": ["setInputFiles"], "reason": "Set the file with page.getByLabel('Attachment').setInputFiles({ name, mimeType, buffer })."},
    ], "mutants": [{"bug": "upload-noop", "reason": "choosing a file no longer shows the file name"}]},
    wrongSolutions=[
        {"label": "truthy locator check", "expect": ["weak-assertion", "weak-test"], "code": IMPORT + """
test('uploads a CSV report', async ({ page }) => {
  await page.goto('/upload');
  await page.getByLabel('Attachment').setInputFiles({ name: 'report.csv', mimeType: 'text/csv', buffer: Buffer.from('id,result\\n1,pass\\n') });
  expect(page.getByText('report.csv')).toBeTruthy();
});
"""},
    ],
)

# 10 --------------------------------------------------------------------------
TS_IMPORT_TYPES = "import { test, expect, type Page, type Locator } from '@playwright/test';\n"
POM_STARTER = TS_IMPORT_TYPES + """
// Build a Page Object for /login, then use it in both tests.
class LoginPage {
  readonly page: Page;
  // TODO: email, password, submit, error locators

  constructor(page: Page) {
    this.page = page;
    // TODO: create the locators once, here
  }

  async goto() {
    // TODO
  }

  async login(email: string, password: string) {
    // TODO
  }
}

test('valid user reaches the dashboard', async ({ page }) => {
  // const loginPage = new LoginPage(page); …
});

test('wrong password shows an error', async ({ page }) => {
  // …
});
"""
POM_CLASS_INLINE = LOGIN_PAGE.split("\n", 2)[2].replace("export class", "class")
POM_TESTS = """
test('valid user reaches the dashboard', async ({ page }) => {
  const loginPage = new LoginPage(page);
  await loginPage.goto();
  await loginPage.login('qa@example.com', 'Passw0rd!');
  await expect(page).toHaveURL(/\\/dashboard$/);
  await expect(page.getByText('Welcome, QA Tester')).toBeVisible();
});

test('wrong password shows an error', async ({ page }) => {
  const loginPage = new LoginPage(page);
  await loginPage.goto();
  await loginPage.login('qa@example.com', 'wrong');
  await expect(loginPage.error).toHaveText('Invalid email or password');
});
"""
POM_SOLUTION = TS_IMPORT_TYPES + "\n" + POM_CLASS_INLINE + POM_TESTS
POM_SOLUTION_JS = IMPORT + """
class LoginPage {
  constructor(page) {
    this.page = page;
    this.email = page.getByLabel('Email');
    this.password = page.getByLabel('Password');
    this.submit = page.getByRole('button', { name: 'Sign in' });
    this.error = page.getByRole('alert');
  }

  async goto() {
    await this.page.goto('/login');
  }

  async login(email, password) {
    await this.email.fill(email);
    await this.password.fill(password);
    await this.submit.click();
  }
}
""" + POM_TESTS
task(
    id="pw-10-page-object", title="Page Object Model",
    summary="Write a LoginPage page object (locators + goto + login) and use it in a positive and a negative login test.",
    why="When the login form changes, you fix one class instead of 40 tests. Page objects also make tests read like your manual steps: loginPage.login(user, password).",
    objectives=["class LoginPage with locators created once in the constructor", "goto() and login(email, password) methods", "Two tests that create new LoginPage(page)"],
    hints=["Keep assertions in tests, not in page objects (except small helpers).", "Expose locators (loginPage.error) so tests can assert on them."],
    pitfalls=["Putting expect() everywhere inside the page object — failures become harder to read.", "Creating locators inside every method instead of once."],
    references=[{"title": "Page object models", "url": D + "pom"}, {"title": "Best practices", "url": D + "best-practices"}],
    teachAlong=["Cause: locators live in one class.", "Effect: UI changes are a one-line fix.", "Gate: requires new LoginPage(page) and catches a wrong redirect."],
    starterCode=POM_STARTER, solution=POM_SOLUTION, solutionJs=POM_SOLUTION_JS,
    starterCodeJs=IMPORT + """
class LoginPage {
  constructor(page) {
    this.page = page;
    // TODO: this.email, this.password, this.submit, this.error
  }

  async goto() {
    // TODO
  }

  async login(email, password) {
    // TODO
  }
}

test('valid user reaches the dashboard', async ({ page }) => {
  // const loginPage = new LoginPage(page); …
});

test('wrong password shows an error', async ({ page }) => {
  // …
});
""",
    gate={"forbidCss": True, "minTests": 2, "requires": [
        {"rule": "new", "anyOf": ["LoginPage"], "reason": "The task requires the page object: create it with new LoginPage(page) in your tests."},
    ], "mutants": [
        {"bug": "login-redirect", "reason": "after sign-in the app goes to the home page instead of the dashboard"},
        {"bug": "welcome-name", "reason": "the dashboard greets the user as 'Guest'"},
    ]},
    wrongSolutions=[
        {"label": "no page object", "expect": ["requires-new-LoginPage"], "code": IMPORT + """
test('valid user reaches the dashboard', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('qa@example.com');
  await page.getByLabel('Password').fill('Passw0rd!');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\\/dashboard$/);
  await expect(page.getByText('Welcome, QA Tester')).toBeVisible();
});

test('wrong password shows an error', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('qa@example.com');
  await page.getByLabel('Password').fill('wrong');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert')).toHaveText('Invalid email or password');
});
"""},
    ],
)

# 11 --------------------------------------------------------------------------
FIXTURE_SOLUTION = """import { test as base, expect } from '@playwright/test';
import { LoginPage } from './pages/LoginPage';

// A custom fixture: every test that asks for loginPage gets one, already on /login.
const test = base.extend<{ loginPage: LoginPage }>({
  loginPage: async ({ page }, use) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await use(loginPage);
  },
});

test('valid user reaches the dashboard', async ({ loginPage, page }) => {
  await loginPage.login('qa@example.com', 'Passw0rd!');
  await expect(page.getByText('Welcome, QA Tester')).toBeVisible();
});

test('unknown user sees an error', async ({ loginPage }) => {
  await loginPage.login('nobody@example.com', 'whatever');
  await expect(loginPage.error).toHaveText('Invalid email or password');
});
"""
task(
    id="pw-11-custom-fixture", title="Custom fixtures",
    summary="LoginPage is provided in pages/LoginPage.ts (read-only). Create a loginPage fixture with test.extend and use it in two tests.",
    why="Fixtures are Playwright's dependency injection: setup + teardown live in one place, tests just ask for what they need ({ loginPage }), and only the fixtures a test uses are created.",
    objectives=["const test = base.extend<{ loginPage: LoginPage }>({ … })", "The fixture opens /login before use(loginPage)", "Two tests destructure { loginPage }"],
    hints=["import { test as base, expect } from '@playwright/test';", "import { LoginPage } from './pages/LoginPage';", "Code after await use(...) is teardown."],
    pitfalls=["Forgetting await use(fixture).", "Calling new LoginPage(page) in every test instead of using the fixture."],
    references=[{"title": "Fixtures", "url": D + "test-fixtures"}, {"title": "Page object models", "url": D + "pom"}],
    teachAlong=["Cause: the fixture builds LoginPage and navigates.", "Effect: tests start at the action, not the setup.", "Gate: requires test.extend and a test that asks for { loginPage }."],
    supportFiles=[{"path": "pages/LoginPage.ts", "content": LOGIN_PAGE, "readOnly": True}],
    starterCode="""import { test as base, expect } from '@playwright/test';
import { LoginPage } from './pages/LoginPage';

// TODO: const test = base.extend<{ loginPage: LoginPage }>({ … });
const test = base;

test('valid user reaches the dashboard', async ({ page }) => {
  // use the loginPage fixture instead of page
});
""",
    solution=FIXTURE_SOLUTION,
    gate={"forbidCss": True, "minTests": 2, "requires": [
        {"rule": "call", "anyOf": ["extend"], "reason": "Create the fixture with base.extend<{ loginPage: LoginPage }>({ loginPage: async ({ page }, use) => { … } })."},
        {"rule": "fixture", "name": "loginPage", "reason": "Use the fixture: write your tests as async ({ loginPage }) => { … } instead of building LoginPage by hand."},
    ], "mutants": [{"bug": "welcome-name", "reason": "the dashboard greets the user as 'Guest'"}]},
    wrongSolutions=[
        {"label": "page object without a fixture", "expect": ["requires-extend", "requires-fixture-loginPage"], "code": """import { test, expect } from '@playwright/test';
import { LoginPage } from './pages/LoginPage';

test('valid user reaches the dashboard', async ({ page }) => {
  const loginPage = new LoginPage(page);
  await loginPage.goto();
  await loginPage.login('qa@example.com', 'Passw0rd!');
  await expect(page.getByText('Welcome, QA Tester')).toBeVisible();
});

test('unknown user sees an error', async ({ page }) => {
  const loginPage = new LoginPage(page);
  await loginPage.goto();
  await loginPage.login('nobody@example.com', 'whatever');
  await expect(loginPage.error).toHaveText('Invalid email or password');
});
"""},
        {"label": "imports a module that is not provided", "expect": ["forbidden-import"], "code": FIXTURE_SOLUTION.replace("'./pages/LoginPage'", "'./pages/LoginPageX'")},
    ],
)

# 12 --------------------------------------------------------------------------
task(
    id="pw-12-data-driven", title="Data-driven tests",
    summary="Generate one test per invalid email from a data array, so each case is reported (and can fail) on its own.",
    why="Equivalence classes and boundary values from manual test design map directly onto data arrays. One test per row gives one report line per case instead of a single test that stops at the first bad value.",
    objectives=["const invalidEmails = [...] with at least 4 values", "for (const email of invalidEmails) { test(`rejects ${email}`, …) }", "Each test asserts 'Enter a valid email address'"],
    hints=["Titles must be unique — include the value in the title.", "Try: 'plainaddress', 'missing-at.example.com', 'user@nodot', 'two@@example.com'"],
    pitfalls=["A loop inside one test: the first failure hides the rest.", "Duplicate titles — Playwright refuses to run them."],
    references=[{"title": "Parameterize tests", "url": D + "test-parameterize"}],
    teachAlong=["Cause: the loop creates N tests at collection time.", "Effect: N independent report lines.", "Gate: at least 4 tests must run, and switching validation off must fail them."],
    starterCode=IMPORT + """
const invalidEmails = ['plainaddress'];

// TODO: generate one test per value
test('rejects an invalid email', async ({ page }) => {
  await page.goto('/register');
});
""",
    solution=IMPORT + """
const invalidEmails = ['plainaddress', 'missing-at.example.com', 'user@nodot', 'two@@example.com'];

for (const email of invalidEmails) {
  test(`rejects invalid email "${email}"`, async ({ page }) => {
    await page.goto('/register');
    await page.getByLabel('Email').fill(email);
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByText('Enter a valid email address')).toBeVisible();
    await expect(page.getByLabel('Email')).toHaveAttribute('aria-invalid', 'true');
  });
}
""",
    gate={"forbidCss": True, "minRunTests": 4, "requires": [
        {"rule": "require-text", "pattern": "for\\s*\\(|\\.forEach\\(", "reason": "Generate the tests from the data array (for … of / forEach) instead of copy-pasting test bodies."},
    ], "mutants": [{"bug": "form-no-validation", "reason": "the form accepts invalid email addresses"}]},
    wrongSolutions=[
        {"label": "one hard-coded case", "expect": ["min-run-tests", "required-pattern"], "code": IMPORT + """
test('rejects an invalid email', async ({ page }) => {
  await page.goto('/register');
  await page.getByLabel('Email').fill('plainaddress');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText('Enter a valid email address')).toBeVisible();
});
"""},
    ],
)

# 13 --------------------------------------------------------------------------
task(
    id="pw-13-auth-setup", title="Auth setup project",
    summary="Write auth.setup.ts: sign in once and save the browser state to playwright/.auth/user.json. A provided dashboard test reuses it.",
    why="Logging in through the UI before every test is slow, and every test fails when login breaks. A setup project logs in once; every other test starts already signed in.",
    objectives=["setup('…', async ({ page }) => { … }) using test as setup", "Wait for the dashboard URL before saving", "await page.context().storageState({ path: 'playwright/.auth/user.json' })"],
    hints=["import { test as setup, expect } from '@playwright/test';", "The hub config runs *.setup.ts in a 'setup' project that the main project depends on."],
    pitfalls=["Saving state before the login redirect finished → the file has no session cookie.", "Committing playwright/.auth to git — it contains real session cookies."],
    references=[{"title": "Authentication", "url": D + "auth"}, {"title": "Project dependencies", "url": D + "test-projects#dependencies"}, {"title": "browserContext.storageState()", "url": D + "api/class-browsercontext#browser-context-storage-state"}],
    teachAlong=["Cause: setup saves cookies + localStorage once.", "Effect: dependent tests start signed in.", "Gate: the provided dashboard test must pass using your saved file."],
    testFile="auth.setup.ts",
    supportFiles=[{"path": "dashboard.spec.ts", "content": DASHBOARD_SPEC, "readOnly": True}],
    starterCode="""import { test as setup, expect } from '@playwright/test';

const authFile = 'playwright/.auth/user.json';

setup('sign in once and save the session', async ({ page }) => {
  // log in through the UI, wait for the dashboard, then save the storage state to authFile
});
""",
    solution=AUTH_SETUP,
    gate={"forbidCss": True, "preset": "auth", "requires": [
        {"rule": "call", "anyOf": ["storageState"], "reason": "Save the session: await page.context().storageState({ path: authFile })."},
        {"rule": "call", "anyOf": ["toHaveURL", "waitForURL"], "reason": "Wait for the login to finish (await expect(page).toHaveURL(/\\/dashboard$/)) before saving, or the state may miss the session cookie."},
    ]},
    wrongSolutions=[
        {"label": "logs in but never saves", "expect": ["requires-storageState", "test-failed"], "code": """import { test as setup, expect } from '@playwright/test';

setup('sign in once and save the session', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('qa@example.com');
  await page.getByLabel('Password').fill('Passw0rd!');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\\/dashboard$/);
});
"""},
    ],
)

# 14 --------------------------------------------------------------------------
task(
    id="pw-14-storage-state", title="Reuse the signed-in state",
    summary="auth.setup.ts is provided. Write tests that start already signed in via storageState: open the dashboard directly and call /api/me with the same session.",
    why="This is what makes large suites fast: hundreds of tests skip the login form. page.request shares the browser's cookies, so API calls are authenticated too.",
    objectives=["test.use({ storageState: 'playwright/.auth/user.json' })", "Open /dashboard directly and assert the greeting", "page.request.get('/api/me') is OK and returns qa@example.com"],
    hints=["Do not fill the login form in these tests.", "await expect(response).toBeOK();"],
    pitfalls=["Logging in again in every test (slow, couples every test to the login page).", "Sharing one account across parallel tests that change user data."],
    references=[{"title": "Authentication: reuse signed-in state", "url": D + "auth#basic-shared-account-in-all-tests"}, {"title": "testOptions.storageState", "url": D + "api/class-testoptions#test-options-storage-state"}, {"title": "API testing: page.request", "url": D + "api-testing#sending-api-requests-from-ui-tests"}],
    teachAlong=["Cause: storageState loads the saved cookie.", "Effect: the dashboard opens without a login step.", "Gate: login-form code in this file fails the task."],
    supportFiles=[{"path": "auth.setup.ts", "content": AUTH_SETUP, "readOnly": True}],
    starterCode=IMPORT + """
// TODO: test.use({ storageState: … })

test('signed-in user sees the dashboard', async ({ page }) => {
  await page.goto('/dashboard');
});
""",
    solution=IMPORT + """
test.use({ storageState: 'playwright/.auth/user.json' });

test('signed-in user sees the dashboard', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\\/dashboard$/);
  await expect(page.getByText('Welcome, QA Tester')).toBeVisible();
});

test('API calls share the session', async ({ page }) => {
  const response = await page.request.get('/api/me');
  await expect(response).toBeOK();
  expect(await response.json()).toMatchObject({ email: 'qa@example.com', name: 'QA Tester' });
});
""",
    gate={"forbidCss": True, "preset": "auth", "minTests": 2, "requires": [
        {"rule": "property", "name": "storageState", "reason": "Load the saved session with test.use({ storageState: 'playwright/.auth/user.json' })."},
        {"rule": "forbid-text", "pattern": "Passw0rd!|getByLabel\\(\\s*['\"]Password", "reason": "You logged in through the form again. Reuse the saved session via storageState — that is what keeps large suites fast."},
    ], "mutants": [{"bug": "welcome-name", "reason": "the dashboard greets the user as 'Guest'"}]},
    wrongSolutions=[
        {"label": "logs in through the UI again", "expect": ["requires-storageState", "forbidden-pattern", "min-tests"], "code": IMPORT + """
test('signed-in user sees the dashboard', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('qa@example.com');
  await page.getByLabel('Password').fill('Passw0rd!');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('Welcome, QA Tester')).toBeVisible();
});
"""},
    ],
)

# 15 --------------------------------------------------------------------------
task(
    id="pw-15-api-testing", title="API testing with the request fixture",
    summary="Test the todos JSON API directly: create a todo (201 + body), find it in the list, and check that an empty title is rejected with 400.",
    why="API tests are fast and precise: they check status codes and contracts without a browser, and they are the cheapest way to seed or verify data for UI tests.",
    objectives=["Use the request fixture: async ({ request }) => …", "POST returns 201 with { id, title, done: false }", "The new todo appears in GET /api/todos", "Empty title → 400 { error: 'Title is required' }"],
    hints=["expect(created.status()).toBe(201)", "expect(body.todos).toContainEqual(expect.objectContaining({ id: todo.id }))"],
    pitfalls=["Only checking response.ok() — 200 instead of 201, or a missing body, passes.", "Depending on data from another test — create what you need in the test."],
    references=[{"title": "API testing", "url": D + "api-testing"}, {"title": "APIRequestContext", "url": D + "api/class-apirequestcontext"}, {"title": "APIResponse assertions", "url": D + "api/class-apiresponseassertions"}],
    teachAlong=["Cause: assert status and body, not just 'ok'.", "Effect: contract changes are caught.", "Gate: a planted bug returns 200 without the created todo."],
    starterCode=IMPORT + """
test('creates a todo through the API', async ({ request }) => {
  // POST /api/todos with { title }, then check status, body, and GET /api/todos
});

test('rejects an empty title with 400', async ({ request }) => {
  // POST an empty title and check the status code and error message
});
""",
    solution=IMPORT + """
test('creates a todo through the API', async ({ request }) => {
  const created = await request.post('/api/todos', { data: { title: 'Automate checkout' } });
  expect(created.status()).toBe(201);
  const todo = await created.json();
  expect(todo).toMatchObject({ title: 'Automate checkout', done: false });
  expect(typeof todo.id).toBe('number');

  const list = await request.get('/api/todos');
  await expect(list).toBeOK();
  const body = await list.json();
  expect(body.todos).toContainEqual(expect.objectContaining({ id: todo.id, title: 'Automate checkout' }));
});

test('rejects an empty title with 400', async ({ request }) => {
  const res = await request.post('/api/todos', { data: { title: '' } });
  expect(res.status()).toBe(400);
  expect(await res.json()).toEqual({ error: 'Title is required' });
});
""",
    gate={"minTests": 2, "requires": [
        {"rule": "fixture", "name": "request", "reason": "Use the API fixture: test('…', async ({ request }) => { … }) — no browser needed."},
    ], "mutants": [{"bug": "api-created", "reason": "POST /api/todos answers 200 without returning the created todo"}]},
    wrongSolutions=[
        {"label": "only checks ok()", "expect": ["weak-test"], "code": IMPORT + """
test('creates a todo through the API', async ({ request }) => {
  const created = await request.post('/api/todos', { data: { title: 'Automate checkout' } });
  expect(created.ok()).toBeTruthy();
});

test('rejects an empty title', async ({ request }) => {
  const res = await request.post('/api/todos', { data: { title: '' } });
  expect(res.ok()).toBeFalsy();
});
"""},
        {"label": "drives the UI instead", "expect": ["requires-fixture-request"], "code": IMPORT + """
test('creates a todo through the UI', async ({ page }) => {
  await page.goto('/todos');
  await page.getByLabel('New todo').fill('Automate checkout');
  await page.getByRole('button', { name: 'Add' }).click();
  await expect(page.getByText('Automate checkout')).toBeVisible();
});

test('rejects an empty title', async ({ page }) => {
  await page.goto('/todos');
  await page.getByRole('button', { name: 'Add' }).click();
  await expect(page.getByRole('alert')).toHaveText('Title is required');
});
"""},
    ],
)

# 16 --------------------------------------------------------------------------
task(
    id="pw-16-network-mocking", title="Network mocking with page.route",
    summary="Mock GET /api/todos to show exact data, and mock a 500 to test the error state the real API never gives you on demand.",
    why="Mocking lets you test edge cases (empty lists, server errors, slow responses) deterministically, without changing the backend.",
    objectives=["page.route('**/api/todos', route => route.fulfill({ json: … })) before page.goto", "Assert the two mocked todos and '1 items left'", "Second test: fulfill with status 500 → the alert 'Could not load todos. Please try again.'"],
    hints=["route.fulfill({ json: { todos: [...] } })", "route.fulfill({ status: 500, json: { error: 'boom' } })"],
    pitfalls=["Registering the route after page.goto — the request already happened.", "Mocking so much that you no longer test anything real."],
    references=[{"title": "Mock APIs", "url": D + "mock"}, {"title": "Network", "url": D + "network"}, {"title": "route.fulfill()", "url": D + "api/class-route#route-fulfill"}],
    teachAlong=["Cause: the route intercepts the page's fetch.", "Effect: the UI renders your data or your error.", "Gate: a planted bug ignores the API data — your mocked-data assertions must catch it."],
    starterCode=IMPORT + """
test('shows todos returned by the API', async ({ page }) => {
  // mock /api/todos, then open /todos and assert the mocked items
  await page.goto('/todos');
});

test('shows an error when the API fails', async ({ page }) => {
  // mock a 500 and assert the alert
});
""",
    solution=IMPORT + """
test('shows todos returned by the API', async ({ page }) => {
  await page.route('**/api/todos', async (route) => {
    await route.fulfill({
      json: { todos: [
        { id: 1, title: 'Mocked: pay invoices', done: false },
        { id: 2, title: 'Mocked: call bank', done: true },
      ] },
    });
  });
  await page.goto('/todos');
  const items = page.getByRole('list', { name: 'Todo list' }).getByRole('listitem');
  await expect(items).toHaveText(['Mocked: pay invoices', '✅ Mocked: call bank']);
  await expect(page.getByText('1 items left')).toBeVisible();
});

test('shows an error when the API fails', async ({ page }) => {
  await page.route('**/api/todos', (route) => route.fulfill({ status: 500, json: { error: 'boom' } }));
  await page.goto('/todos');
  await expect(page.getByRole('alert')).toHaveText('Could not load todos. Please try again.');
});
""",
    gate={"forbidCss": True, "minTests": 2, "requires": [
        {"rule": "call", "anyOf": ["route"], "reason": "Didn't mock the route: call page.route('**/api/todos', …) before page.goto so the page receives your data."},
        {"rule": "call", "anyOf": ["fulfill"], "reason": "Answer the intercepted request with route.fulfill({ json: … }) (or { status: 500 })."},
    ], "mutants": [{"bug": "todos-ignore-api", "reason": "the todo page ignores the API response"}]},
    wrongSolutions=[
        {"label": "no mocking (real seed data)", "expect": ["requires-route", "requires-fulfill", "min-tests"], "code": IMPORT + """
test('shows todos', async ({ page }) => {
  await page.goto('/todos');
  await expect(page.getByText('Write test plan')).toBeVisible();
});
"""},
    ],
)

# 17 --------------------------------------------------------------------------
SLEEP_ORDERS = IMPORT + """
test('orders API and UI agree', async ({ page }) => {
  await page.goto('/async');
  await page.getByRole('button', { name: 'Load orders' }).click();
  await page.waitForTimeout(2000);
  await expect(page.getByRole('list', { name: 'Orders' }).getByRole('listitem')).toHaveCount(3);
});
"""
task(
    id="pw-17-wait-for-response", title="Wait for the network, not the clock",
    summary="Start waiting for the /api/orders response before clicking 'Load orders', then assert on both the JSON and the UI.",
    why="Sometimes you need the data the page received (an order id, a total). waitForResponse gives you the real response without guessing a delay.",
    objectives=["const responsePromise = page.waitForResponse(…) before the click", "Assert the JSON has 3 orders", "Assert the page shows as many list items as the API returned"],
    hints=["page.waitForResponse((res) => res.url().endsWith('/api/orders') && res.status() === 200)"],
    pitfalls=["Starting waitForResponse after the click (race).", "Replacing it with waitForTimeout(2000)."],
    references=[{"title": "Network events", "url": D + "network#network-events"}, {"title": "page.waitForResponse()", "url": D + "api/class-page#page-wait-for-response"}],
    starterCode=SLEEP_ORDERS,
    solution=IMPORT + """
test('orders API and UI agree', async ({ page }) => {
  await page.goto('/async');
  const responsePromise = page.waitForResponse((res) => res.url().endsWith('/api/orders') && res.status() === 200);
  await page.getByRole('button', { name: 'Load orders' }).click();
  const response = await responsePromise;
  const data = await response.json();
  expect(data.orders).toHaveLength(3);
  await expect(page.getByRole('list', { name: 'Orders' }).getByRole('listitem')).toHaveCount(data.orders.length);
  await expect(page.getByText(`Loaded ${data.orders.length} orders`)).toBeVisible();
});
""",
    gate={"forbidCss": True, "requires": [
        {"rule": "call", "anyOf": ["waitForResponse"], "reason": "Wait for the network: const responsePromise = page.waitForResponse(…) before clicking 'Load orders'."},
    ], "mutants": [{"bug": "orders-empty", "reason": "the orders API never returns any orders"}]},
    wrongSolutions=[
        {"label": "starter (fixed sleep)", "expect": ["no-wait-for-timeout", "requires-waitForResponse"], "code": SLEEP_ORDERS},
    ],
)

# 18 --------------------------------------------------------------------------
VISUAL_SOLUTION = IMPORT + """
test.beforeEach(async ({ page }) => {
  // Sign in through the API (fast) — page.request shares cookies with the page.
  const res = await page.request.post('/api/login', { data: { email: 'qa@example.com', password: 'Passw0rd!' } });
  await expect(res).toBeOK();
});

test('dashboard looks right', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page).toHaveScreenshot('dashboard.png', {
    mask: [page.getByTestId('session-id'), page.getByTestId('live-clock')],
  });
});
"""
task(
    id="pw-18-visual", title="Visual comparisons",
    summary="Take a visual snapshot of the dashboard with toHaveScreenshot, masking the parts that change on every load (session id and live clock).",
    why="Visual tests catch CSS and layout regressions that text assertions miss — but only if dynamic content is masked; otherwise they are flaky by design.",
    objectives=["await expect(page).toHaveScreenshot('dashboard.png', { mask: [...] })", "Mask getByTestId('session-id') and getByTestId('live-clock')", "Pass on all 3 runs and catch the planted style regression"],
    hints=["The first run writes the baseline (the hub uses updateSnapshots: 'missing'); runs 2–3 compare against it.", "toHaveScreenshot waits for two identical screenshots in a row — a ticking clock never settles."],
    pitfalls=["Not masking dynamic data → never stable.", "Comparing screenshots across OSes/browsers — keep baselines per platform (or generate them in CI's Docker image)."],
    references=[{"title": "Visual comparisons", "url": D + "test-snapshots"}, {"title": "toHaveScreenshot options (mask)", "url": D + "api/class-pageassertions#page-assertions-to-have-screenshot-1"}],
    teachAlong=["Cause: masked regions are painted over.", "Effect: only real UI changes fail the comparison.", "Gate: a planted CSS change must make your snapshot fail."],
    starterCode=IMPORT + """
test.beforeEach(async ({ page }) => {
  const res = await page.request.post('/api/login', { data: { email: 'qa@example.com', password: 'Passw0rd!' } });
  await expect(res).toBeOK();
});

test('dashboard looks right', async ({ page }) => {
  await page.goto('/dashboard');
  // TODO: toHaveScreenshot with masks for the dynamic parts
});
""",
    solution=VISUAL_SOLUTION,
    gate={"requires": [
        {"rule": "call", "anyOf": ["toHaveScreenshot"], "reason": "Use the visual assertion: await expect(page).toHaveScreenshot('dashboard.png', { … })."},
        {"rule": "property", "name": "mask", "reason": "Mask the dynamic parts (session id, live clock) with the mask option, or the screenshot can never be stable."},
    ], "mutants": [{"bug": "visual-shift", "reason": "the dashboard cards are restyled"}]},
    wrongSolutions=[
        {"label": "no mask", "expect": ["requires-mask", "test-failed"], "code": VISUAL_SOLUTION.replace("""  await expect(page).toHaveScreenshot('dashboard.png', {
    mask: [page.getByTestId('session-id'), page.getByTestId('live-clock')],
  });""", "  await expect(page).toHaveScreenshot('dashboard.png');")},
    ],
)

# 19 --------------------------------------------------------------------------
STEPS_SOLUTION = IMPORT + """
test('checkout with a test card', { tag: ['@smoke', '@checkout'] }, async ({ page }) => {
  await test.step('open checkout', async () => {
    await page.goto('/frames');
    await expect(page.getByText('Order total: $42.50')).toBeVisible();
  });

  const payment = page.getByTitle('Payment form').contentFrame();

  await test.step('pay with a valid card', async () => {
    await payment.getByLabel('Card number').fill('4242424242424242');
    await payment.getByRole('button', { name: 'Pay now' }).click();
  });

  await test.step('see the confirmation', async () => {
    await expect(payment.getByRole('status')).toHaveText('Payment accepted for card ending 4242');
  });
});
"""
STEPS_STARTER = IMPORT + """
test('checkout with a test card', async ({ page }) => {
  await page.goto('/frames');
  const payment = page.getByTitle('Payment form').contentFrame();
  await payment.getByLabel('Card number').fill('4242424242424242');
  await payment.getByRole('button', { name: 'Pay now' }).click();
  await expect(payment.getByRole('status')).toHaveText('Payment accepted for card ending 4242');
});
"""
task(
    id="pw-19-steps-tags", title="Steps & tags for readable reports",
    summary="Structure a checkout test into test.step blocks (like manual test steps) and tag it @smoke and @checkout.",
    why="Steps show up in the HTML report and the trace viewer, so a failure reads 'pay with a valid card' instead of a bare line number. Tags let CI run subsets: --grep @smoke.",
    objectives=["Three awaited test.step blocks", "{ tag: ['@smoke', '@checkout'] } in the test details", "Assert the confirmation inside the iframe"],
    hints=["test('title', { tag: '@smoke' }, async ({ page }) => …)", "npx playwright test --grep @smoke"],
    pitfalls=["Forgetting await on test.step.", "Putting @smoke only in the title text instead of the tag option."],
    references=[{"title": "test.step()", "url": D + "api/class-test#test-step"}, {"title": "Tag tests", "url": D + "test-annotations#tag-tests"}],
    starterCode=STEPS_STARTER,
    solution=STEPS_SOLUTION,
    gate={"forbidCss": True, "requires": [
        {"rule": "call", "anyOf": ["step"], "reason": "Wrap the phases in await test.step('…', async () => { … }) so reports read like test steps."},
        {"rule": "property", "name": "tag", "reason": "Tag the test: test('…', { tag: ['@smoke', '@checkout'] }, async ({ page }) => …)."},
    ], "mutants": [{"bug": "frame-declined", "reason": "the payment iframe declines every card"}]},
    wrongSolutions=[
        {"label": "unawaited step", "expect": ["missing-await"], "code": STEPS_SOLUTION.replace("  await test.step('see the confirmation'", "  test.step('see the confirmation'")},
        {"label": "no steps or tags", "expect": ["requires-step", "requires-tag"], "code": STEPS_STARTER},
    ],
)

for _i, _t in enumerate(TASKS, start=1):
    _t["order"] = _i
