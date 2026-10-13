/** Plain-language rewrites of common Postgres / Python / Prisma / TS errors (pure). First match wins. */
const RULES: Array<[RegExp, (m: RegExpMatchArray) => string]> = [
  [/relation "([^"]+)" does not exist/i, (m) => `There is no table called \`${m[1]}\` yet. Check the spelling, or create it before you use it.`],
  [/relation "([^"]+)" already exists/i, (m) => `\`${m[1]}\` already exists. Each table can be created once; remove the duplicate CREATE TABLE.`],
  [/column "([^"]+)" (?:of relation "([^"]+)" )?does not exist/i, (m) => `There is no column \`${m[1]}\`${m[2] ? ` in \`${m[2]}\`` : ""}. Check the name or add the column first.`],
  [/syntax error at or near "([^"]+)"/i, (m) => `Postgres stopped reading at \`${m[1]}\`. Look just before it for a missing comma, bracket or keyword.`],
  [/syntax error at end of input/i, () => "The statement ends too early. Look for an unclosed bracket or a missing value."],
  [/violates foreign key constraint/i, () => "A row points at a parent that does not exist. Insert the parent first, or use an existing id."],
  [/violates unique constraint/i, () => "That value is already used and must be unique. Use a different value."],
  [/violates not-null constraint/i, () => "A required column was left empty (NULL). Give it a value, or a DEFAULT."],
  [/violates check constraint/i, () => "The row breaks one of your CHECK rules. That is the constraint working: change the data, or the rule."],
  [/there is no unique constraint matching given keys/i, () => "A foreign key must point at a PRIMARY KEY or UNIQUE column of the parent table."],
  [/NameError: name '([^']+)' is not defined/, (m) => `Python does not know \`${m[1]}\`. Import it, or check the spelling.`],
  [/IndentationError|unexpected indent/i, () => "The indentation is off. Python uses indentation to group lines: line them up with 4 spaces."],
  [/SyntaxError: (.+)/, (m) => `Python could not read this line: ${m[1]}`],
  [/ImportError|Import of .* is not allowed|not allowed in the lab/i, () => "That import is not available in the lab. Use the SQLAlchemy names from the starter code."],
  [/Could not determine join condition|NoForeignKeysError/i, () => "SQLAlchemy cannot find the foreign key between these classes. Add a ForeignKey column on the child."],
  [/Unknown type "?([\w.]+)"?/i, (m) => `\`${m[1]}\` is not a Prisma type. Use String, Int, Boolean, DateTime, Decimal… or a model name.`],
  [/TimeoutError|ran longer than/i, () => "Your code took too long and was stopped. Look for a loop that never ends or a very large query."],
];

export function friendlyError(message: string | undefined | null): string | null {
  if (!message) return null;
  for (const [re, fn] of RULES) {
    const m = message.match(re);
    if (m) return fn(m);
  }
  return null;
}
export const FRIENDLY_RULE_COUNT = RULES.length;
