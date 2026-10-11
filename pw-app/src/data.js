// Seed data for the app under test. Deterministic: same seed every reset.
export const USERS = [
  { email: "qa@example.com", password: "Passw0rd!", name: "QA Tester", role: "tester" },
  { email: "admin@example.com", password: "Adm1n!pass", name: "Ada Admin", role: "admin" },
];

export const PRODUCTS = [
  { id: 1, name: "Apple", category: "Fruit", price: 1.2, stock: 50 },
  { id: 2, name: "Banana", category: "Fruit", price: 0.5, stock: 120 },
  { id: 3, name: "Cherry", category: "Fruit", price: 6.0, stock: 15 },
  { id: 4, name: "Sourdough", category: "Bakery", price: 7.5, stock: 8 },
  { id: 5, name: "Croissant", category: "Bakery", price: 3.2, stock: 24 },
  { id: 6, name: "Bagel", category: "Bakery", price: 2.1, stock: 30 },
  { id: 7, name: "Milk", category: "Dairy", price: 2.4, stock: 40 },
  { id: 8, name: "Cheddar", category: "Dairy", price: 9.9, stock: 12 },
  { id: 9, name: "Yoghurt", category: "Dairy", price: 4.3, stock: 0 },
  { id: 10, name: "Date", category: "Fruit", price: 8.8, stock: 5 },
  { id: 11, name: "Eclair", category: "Bakery", price: 4.0, stock: 6 },
  { id: 12, name: "Feta", category: "Dairy", price: 6.6, stock: 18 },
];

export const SEED_TODOS = [
  { id: 1, title: "Write test plan", done: true },
  { id: 2, title: "Automate login test", done: false },
  { id: 3, title: "Review flaky tests", done: false },
];

export const ORDERS = [
  { id: "A-1001", customer: "Ana", total: 42.5, status: "Shipped" },
  { id: "A-1002", customer: "Ben", total: 13.0, status: "Processing" },
  { id: "A-1003", customer: "Chen", total: 99.99, status: "Delivered" },
];

export const TEAM = ["Ana", "Ben", "Chen"];

/** Delays (ms) used by /api/orders, cycled per run so waitForTimeout() is reliably flaky. */
export const ORDER_DELAYS = [250, 1600, 700];

/** Bugs the runner can switch on per request (x-sut-bug header) to check tests catch regressions. */
export const BUGS = {
  "login-redirect": "After a successful sign-in the app goes to the home page, not the dashboard.",
  "welcome-name": "The dashboard greets everyone as Guest.",
  "form-no-validation": "The registration form accepts empty and invalid input.",
  "sort-broken": "Clicking a column header no longer sorts the table.",
  "filter-broken": "The product search box is ignored.",
  "todos-ignore-api": "The todo page ignores the API response and shows no todos.",
  "api-created": "POST /api/todos returns 200 without the created todo.",
  "dialog-noop": "Confirming a delete does not remove the row.",
  "frame-declined": "The payment iframe declines every card.",
  "newtab-wrong": "The help link opens a page with the wrong heading.",
  "upload-noop": "Choosing a file no longer shows the file name.",
  "orders-empty": "Orders never finish loading.",
  "settings-noop": "The Settings dialog Save button does nothing.",
  "visual-shift": "The dashboard cards are restyled (visual regression).",
  "logout-noop": "Sign out does not end the session.",
};
