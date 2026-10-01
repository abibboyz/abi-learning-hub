/**
 * Constrained Node lab runner.
 * Primary path: whitelisted SQL DDL via pg (mirrors ORM→SQL mapping).
 * Prisma schema snippets are accepted as documentation + converted checks;
 * unrestricted shell / eval is blocked.
 */

const FORBIDDEN = [
  /require\s*\(\s*['"]child_process['"]/,
  /require\s*\(\s*['"]fs['"]/,
  /require\s*\(\s*['"]net['"]/,
  /from\s+['"]child_process['"]/,
  /from\s+['"]fs['"]/,
  /from\s+['"]node:fs['"]/,
  /process\.env/,
  /eval\s*\(/,
  /Function\s*\(/,
  /execSync/,
  /spawnSync/,
];

export function validateNodeLabCode(code: string): { ok: true } | { ok: false; reason: string } {
  if (code.length > 20000) return { ok: false, reason: "Code exceeds 20000 characters" };
  for (const re of FORBIDDEN) {
    if (re.test(code)) {
      return { ok: false, reason: `Forbidden pattern: ${re}` };
    }
  }
  return { ok: true };
}

/** Extract CREATE TABLE statements for gated execution */
export function extractCreateTables(code: string): string[] {
  const stmts: string[] = [];
  const re = /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+[\s\S]+?;|CREATE\s+TABLE\s+[\s\S]+?;/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code))) {
    stmts.push(m[0]);
  }
  return stmts;
}

export function looksLikePrisma(code: string): boolean {
  return /model\s+\w+\s*\{/.test(code) || /datasource\s+db/.test(code);
}
