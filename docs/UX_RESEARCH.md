# UX research → what the lab does

Goal (from Abinash): **easy to learn with, and easy to run and test code.** This note lists what other learning tools and
developer tools do well, and the feature each finding led to in the lab. It folds in the Product Engineer review
(`abi-learning-hub-uiux-research.md`) and design spec v2 (`abi-learning-hub-design/SPEC.md`).

## Sources

**Pages fetched while writing this note** (cited below by number):

1. Exercism, *Automated feedback* — https://exercism.org/docs/using/feedback/automated
2. SQLBolt, lesson 1 — https://sqlbolt.com/lesson/select_queries_introduction
3. Playwright, *UI Mode* — https://playwright.dev/docs/test-ui-mode
4. Playwright, *Trace viewer* — https://playwright.dev/docs/trace-viewer
5. Prisma Studio — https://www.prisma.io/studio
6. dbdiagram.io — https://dbdiagram.io/home
7. Boot.dev — https://www.boot.dev/
8. Scrimba — https://scrimba.com/
9. DataLemur — https://datalemur.com/
10. Brilliant, *About* — https://brilliant.org/about/
11. freeCodeCamp contributor docs, *How to work on coding challenges* — https://contribute.freecodecamp.org/how-to-work-on-coding-challenges/
12. PostgreSQL docs, *Using EXPLAIN* — https://www.postgresql.org/docs/current/using-explain.html

**Seen only as search-result summaries** (the full pages were not opened): Codecademy Help Center articles on
*View Solution*, the *Accessibility Guide* (panes are ARIA regions; checkpoints are announced), and *Get Unstuck*
(diff against the solution; Reset). They are marked "(search summary)" below.

Boot.dev [7], Scrimba [8] and DataLemur [9] were opened as a product overview only; they are cited just for "run code in the browser, no setup".

**Could not be read:** LeetCode (Cloudflare block), freecodecamp.org/learn (empty page without JS), and one
Codecademy URL (404). No claims below come from these.

**Learning science (well-known papers; not re-read for this note):** Sweller (1988), cognitive load during problem
solving, *Cognitive Science* 12(2); Hattie & Timperley (2007), "The Power of Feedback", *Review of Educational
Research* 77(1); Shute (2008), "Focus on Formative Feedback", *Review of Educational Research* 78(1);
Roediger & Karpicke (2006), test-enhanced learning, *Psychological Science* 17(3).

## Findings → what was built

| # | Finding | Source | Built in this PR |
|---|---|---|---|
| 1 | Feedback should be immediate, specific and say *what to do next*, not just pass/fail. | [1], [10]; Hattie & Timperley, Shute | **Check** shows every failing requirement with its rule id, line and a plain-language message; a live **checklist** in the lesson pane ticks ✓/✗ per requirement; **~17 friendly explanations** for common Postgres/Python/Prisma errors. |
| 2 | Separate "just try it" from "grade me". | [3] (watch mode / run a single test) | **Run** (Ctrl/⌘+Enter) executes only: SQL in a rolled-back transaction, Prisma/Drizzle translated and rolled back. **Check** (Ctrl/⌘+Shift+Enter) runs and grades; after a pass it becomes **Next →**. |
| 3 | One concept per step, short steps, each one runnable. | [11] (one concept per step, the 2-minute guideline), [2] | Lesson layout **Concept → Why → Goal → Example → Try it → Checklist**; numbered map with ✓ ● ○ and **Continue**. |
| 4 | Show the result next to the code; let learners compare with the expected output. | [2] (results table under the editor), Codecademy View Solution/diff (search summary) | Output tab with **SQL result tables**; **Expected vs yours** side by side with **≠** on mismatched rows (order-insensitive, generated timestamps ignored); schema diff; printed-output diff. Expected artefacts are captured from the reference solutions (`scripts/capture_expected.py`). |
| 5 | Make state visible: what changed in the data. | [5] (browse and edit data visually), [4] (before/after DOM snapshots per action) | **Data** tab: each exercise table after the run with **+ added / ~ changed / − removed** rows against the snapshot taken before it. |
| 6 | A timeline of attempts helps debugging and reflection. | [4] (action timeline), [3] | **History** tab: every Run/Check of this item as a ✓/✗/▶ timeline, first pass ringed, hint level shown, "Load code" replays it. |
| 7 | Help that escalates instead of giving the answer away; the answer stays available. | [1], [10] (practice without scaffolding), Codecademy Get Unstuck (search summary); Sweller (worked examples lower load for novices) | **Hint ladder**: 1 nudge → 2 concept (+ links) → 3 near-solution with the key parts blanked `____`; full solution only behind a confirm. Use is recorded (`hint_usage`) and shown as an **assisted** badge, never a penalty. |
| 8 | Visual diagrams of schemas and relationships. | [6], [5] | ER diagram is now `role="img"` with a text description, PK/FK as text, theme colours, change highlights after a pass, and a "Schema as text" list. |
| 9 | Explain *how* the database runs a query. | [12] (plan tree, cost, `EXPLAIN ANALYZE` actual rows; runs the statement, so wrap DML in a rolled-back transaction) | SQL track **Plan** tab: EXPLAIN / EXPLAIN ANALYZE of the selection or last statement, always rolled back; plan tree with cost share and estimate-off warnings; **step-through in execution order** with a sentence per node. |
| 10 | Testing yourself beats rereading. | Roediger & Karpicke; [10] (pretesting) | Every lesson keeps its runnable exercise or graded quiz; Check is one keystroke away. |
| 11 | Keyboard-first and accessible editors. | [3] (keyboard-driven test running), Codecademy Accessibility Guide (search summary) | CodeMirror 6 with labelled editor, **Esc then Tab** to leave it, error lines in the gutter, **F8** next error, **Ctrl/⌘+H** hint, `?` shortcut sheet (native modal dialog), skip link, APG tabs, `?editor=plain` textarea fallback. |
| 12 | Low-friction start. | [7], [8], [9] (code in the browser, no setup) | Unchanged: one `docker compose up`, only :3000 published; progress saved in the browser (`alh:progress:<trackId>`). |

## What was *not* adopted (yet)

- Streaks, XP and leaderboards: they work against the "never punitive" rule in the spec.
- A Playwright trace viewer inside the lab [3], [4]: deferred (see the spec table in the PR description).
