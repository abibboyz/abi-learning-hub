/**
 * Source of hub/test.ts, written into every run directory.
 * Learner imports of '@playwright/test' are rewritten to this module, which re-exports
 * everything and adds one auto fixture that records console, page errors and network
 * traffic per test (shown in the lab's Console / Network tabs).
 */
export const HUB_TEST_SOURCE = `import { test as base } from '@playwright/test';
export * from '@playwright/test';

type HubLogEntry = { kind: 'console' | 'pageerror' | 'request' | 'requestfailed'; text: string; at: number; status?: number; method?: string; url?: string; level?: string };

export const test = base.extend<{ _hubLog: void }>({
  _hubLog: [async ({ context }, use, testInfo) => {
    const log: HubLogEntry[] = [];
    const t0 = Date.now();
    const push = (e: Omit<HubLogEntry, 'at'>) => { if (log.length < 400) log.push({ ...e, at: Date.now() - t0 }); };
    const attach = (page: import('@playwright/test').Page) => {
      page.on('console', (m) => push({ kind: 'console', level: m.type(), text: m.text().slice(0, 500) }));
      page.on('pageerror', (e) => push({ kind: 'pageerror', text: String(e).slice(0, 500) }));
      page.on('requestfinished', (r) => {
        void r.response().then((res) => push({ kind: 'request', method: r.method(), url: r.url(), status: res ? res.status() : undefined, text: r.method() + ' ' + r.url() })).catch(() => {});
      });
      page.on('requestfailed', (r) => push({ kind: 'requestfailed', method: r.method(), url: r.url(), text: (r.failure() || { errorText: 'failed' }).errorText }));
    };
    context.pages().forEach(attach);
    context.on('page', attach);
    await use();
    await testInfo.attach('hub-log', { body: JSON.stringify(log), contentType: 'application/json' });
  }, { auto: true }],
});
`;
