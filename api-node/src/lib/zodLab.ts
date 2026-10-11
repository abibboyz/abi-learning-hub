/**
 * Zod lab — evaluates a learner's Zod schema WITHOUT executing their code.
 *
 * The source is parsed with the TypeScript compiler API; only a whitelisted subset of Zod builder
 * expressions is interpreted (z.object/string/number/…, chained checks like .min/.int/.email, literal
 * arguments, references to other top-level schemas) and rebuilt with the real `zod` package. Arbitrary
 * code (functions, .refine/.transform, calls on anything but z/schemas) is rejected with a line number.
 * The rebuilt schema is then run against the exercise's cases with safeParse.
 */
import ts from "typescript";
import { z } from "zod";
import type { Failure, ZodRequirement } from "./taskChecker.js";

const Z_FACTORIES = new Set([
  "object", "string", "number", "boolean", "bigint", "date", "array", "enum", "literal", "union", "optional",
  "nullable", "null", "undefined", "any", "unknown", "record", "tuple", "discriminatedUnion", "coerce", "never",
]);
const COERCE = new Set(["number", "string", "boolean", "date", "bigint"]);
const SCHEMA_METHODS = new Set([
  "min", "max", "length", "int", "positive", "nonnegative", "negative", "nonpositive", "gt", "gte", "lt", "lte",
  "multipleOf", "finite", "safe", "email", "url", "uuid", "cuid", "regex", "startsWith", "endsWith", "includes",
  "trim", "toLowerCase", "toUpperCase", "datetime", "ip", "optional", "nullable", "nullish", "default", "describe",
  "strict", "passthrough", "strip", "partial", "required", "extend", "merge", "pick", "omit", "array", "nonempty",
  "or", "and", "element", "keyof", "shape", "unwrap",
]);
const CODE_METHODS = new Set(["refine", "superRefine", "transform", "preprocess", "pipe", "catch", "brand", "parse", "safeParse"]);

class LabError extends Error {
  constructor(message: string, public line?: number) {
    super(message);
  }
}

type Ctx = { sf: ts.SourceFile; decls: Map<string, ts.Expression>; cache: Map<string, unknown>; stack: Set<string> };

function lineOf(ctx: Ctx, node: ts.Node) {
  return ctx.sf.getLineAndCharacterOfPosition(node.getStart(ctx.sf)).line + 1;
}

const ZNS = Symbol("z");

function resolveName(ctx: Ctx, name: string, line?: number): unknown {
  const decl = ctx.decls.get(name);
  if (!decl) throw new LabError(`\`${name}\` is not defined (only z and your top-level schemas are available).`, line);
  if (ctx.cache.has(name)) return ctx.cache.get(name);
  if (ctx.stack.has(name)) throw new LabError(`\`${name}\` refers to itself — use z.lazy outside the lab.`, line);
  ctx.stack.add(name);
  const v = evalExpr(ctx, decl);
  ctx.stack.delete(name);
  ctx.cache.set(name, v);
  return v;
}

function evalExpr(ctx: Ctx, node: ts.Expression): unknown {
  const line = lineOf(ctx, node);
  if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isSatisfiesExpression?.(node)) {
    return evalExpr(ctx, (node as ts.ParenthesizedExpression).expression);
  }
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (node.kind === ts.SyntaxKind.NullKeyword) return null;
  if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.MinusToken && ts.isNumericLiteral(node.operand)) {
    return -Number(node.operand.text);
  }
  if (ts.isRegularExpressionLiteral(node)) {
    const m = node.text.match(/^\/(.*)\/([a-z]*)$/s);
    if (!m || m[1].length > 200) throw new LabError("Regex literal too long or invalid.", line);
    return new RegExp(m[1], m[2]);
  }
  if (ts.isArrayLiteralExpression(node)) return node.elements.map((e) => evalExpr(ctx, e as ts.Expression));
  if (ts.isObjectLiteralExpression(node)) {
    const out: Record<string, unknown> = Object.create(null);
    for (const p of node.properties) {
      const key = p.name && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) ? p.name.text : "";
      if (["__proto__", "constructor", "prototype"].includes(key)) {
        throw new LabError(`Property name \`${key}\` is not allowed.`, lineOf(ctx, p));
      }
      if (ts.isPropertyAssignment(p) && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name))) {
        out[p.name.text] = evalExpr(ctx, p.initializer);
      } else if (ts.isShorthandPropertyAssignment(p)) {
        out[p.name.text] = evalExpr(ctx, p.name);
      } else {
        throw new LabError("Only plain `key: value` properties are supported in object literals.", lineOf(ctx, p));
      }
    }
    return out;
  }
  if (ts.isIdentifier(node)) {
    if (node.text === "z") return ZNS;
    if (node.text === "undefined") return undefined;
    return resolveName(ctx, node.text, line);
  }
  if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
    const method = node.expression.name.text;
    const target = node.expression.expression;
    if (CODE_METHODS.has(method)) {
      throw new LabError(
        `.${method}() runs custom code, which the lab does not execute — express the rule with built-in checks ` +
          "(min, max, int, positive, email, regex, …).",
        line
      );
    }
    const args = node.arguments.map((a) => {
      if (ts.isArrowFunction(a) || ts.isFunctionExpression(a)) {
        throw new LabError("Functions are not allowed in lab schemas.", lineOf(ctx, a));
      }
      return evalExpr(ctx, a as ts.Expression);
    });
    // z.coerce.number()
    if (ts.isPropertyAccessExpression(target) && target.name.text === "coerce" && ts.isIdentifier(target.expression) && target.expression.text === "z") {
      if (!COERCE.has(method)) throw new LabError(`z.coerce.${method} is not supported.`, line);
      return (z.coerce as unknown as Record<string, (...a: unknown[]) => unknown>)[method](...args);
    }
    const recv = evalExpr(ctx, target);
    if (recv === ZNS) {
      if (!Z_FACTORIES.has(method) || method === "coerce") throw new LabError(`z.${method}() is not supported in the lab.`, line);
      return (z as unknown as Record<string, (...a: unknown[]) => unknown>)[method](...args);
    }
    if (recv instanceof z.ZodType) {
      if (!SCHEMA_METHODS.has(method)) throw new LabError(`.${method}() is not supported in the lab.`, line);
      const fn = (recv as unknown as Record<string, unknown>)[method];
      if (typeof fn !== "function") throw new LabError(`.${method}() does not exist on this schema type.`, line);
      return (fn as (...a: unknown[]) => unknown).apply(recv, args);
    }
    throw new LabError(`.${method}() can only be called on z or on a Zod schema.`, line);
  }
  if (ts.isPropertyAccessExpression(node)) {
    const recv = evalExpr(ctx, node.expression);
    if (recv instanceof z.ZodObject && node.name.text === "shape") return recv.shape;
    if (recv && typeof recv === "object" && !(recv instanceof z.ZodType) && Object.hasOwn(recv as object, node.name.text)) {
      return (recv as Record<string, unknown>)[node.name.text];
    }
    throw new LabError(`Property access \`.${node.name.text}\` is not supported here.`, line);
  }
  throw new LabError(`Unsupported expression \`${node.getText(ctx.sf).slice(0, 40)}\`.`, line);
}

export type ZodLabResult = { ok: boolean; failures: Failure[] };

export function checkZodExercise(source: string, req: ZodRequirement, js: boolean): ZodLabResult {
  const sf = ts.createSourceFile(js ? "lab.js" : "lab.ts", source, ts.ScriptTarget.ES2022, true, js ? ts.ScriptKind.JS : ts.ScriptKind.TS);
  const diags = (sf as unknown as { parseDiagnostics?: ts.Diagnostic[] }).parseDiagnostics || [];
  if (diags.length) {
    const d = diags[0];
    const line = d.start != null ? sf.getLineAndCharacterOfPosition(d.start).line + 1 : undefined;
    return {
      ok: false,
      failures: [{ rule: "rejected", message: `SyntaxError: ${ts.flattenDiagnosticMessageText(d.messageText, " ")}${line ? ` (line ${line})` : ""}`, line }],
    };
  }
  const ctx: Ctx = { sf, decls: new Map(), cache: new Map(), stack: new Set() };
  try {
    for (const st of sf.statements) {
      if (ts.isImportDeclaration(st)) {
        const mod = (st.moduleSpecifier as ts.StringLiteral).text;
        if (mod !== "zod") throw new LabError(`Only "zod" can be imported in this exercise (found "${mod}").`, lineOf(ctx, st));
        continue;
      }
      if (ts.isTypeAliasDeclaration(st) || ts.isInterfaceDeclaration(st)) continue;
      if (ts.isVariableStatement(st)) {
        for (const d of st.declarationList.declarations) {
          if (!ts.isIdentifier(d.name) || !d.initializer) {
            if (ts.isObjectBindingPattern(d.name) && d.initializer && /^require\(\s*["']zod["']\s*\)$/.test(d.initializer.getText(sf))) continue;
            throw new LabError("Use `const Name = z…` declarations.", lineOf(ctx, d));
          }
          if (/^require\(/.test(d.initializer.getText(sf))) {
            if (!/^require\(\s*["']zod["']\s*\)$/.test(d.initializer.getText(sf))) {
              throw new LabError('Only require("zod") is allowed in this exercise.', lineOf(ctx, d));
            }
            continue;
          }
          ctx.decls.set(d.name.text, d.initializer);
        }
        continue;
      }
      if (ts.isExportDeclaration(st)) continue;
      if (ts.isExpressionStatement(st) && /^module\.exports\s*=/.test(st.getText(sf))) continue;
      throw new LabError(
        "Only imports, `const X = z…` schema declarations, types and exports are allowed in this exercise.",
        lineOf(ctx, st)
      );
    }
    if (!ctx.decls.has(req.name)) {
      return {
        ok: false,
        failures: [
          {
            rule: "missing-name",
            message: `\`${req.name}\` is not defined. Why: the gate validates sample inputs with that schema — keep that exact name.`,
          },
        ],
      };
    }
    for (const name of ctx.decls.keys()) resolveName(ctx, name);
  } catch (e) {
    if (e instanceof LabError) {
      return { ok: false, failures: [{ rule: "rejected", message: e.message + (e.line ? ` (line ${e.line})` : ""), line: e.line }] };
    }
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, failures: [{ rule: "runtime-error", message: `Zod error while building the schema: ${msg}` }] };
  }
  const schema = ctx.cache.get(req.name);
  if (!(schema instanceof z.ZodType)) {
    return { ok: false, failures: [{ rule: "rejected", message: `\`${req.name}\` must be a Zod schema (z.object({...}) …).` }] };
  }
  const failures: Failure[] = [];
  for (const c of req.cases) {
    const r = schema.safeParse(c.input);
    if (c.expect === "invalid" && r.success) {
      failures.push({ rule: "accepts-invalid", message: `${c.message} Your schema accepted ${JSON.stringify(c.input)}.` });
    } else if (c.expect === "valid" && !r.success) {
      const issue = r.error.issues[0];
      failures.push({
        rule: "rejects-valid",
        message: `${c.message} Your schema rejected ${JSON.stringify(c.input)}: ${issue.path.join(".") || "(root)"} — ${issue.message}`,
      });
    }
  }
  return { ok: failures.length === 0, failures };
}
