/**
 * Formula Engine — computes derived column values from expressions.
 *
 * Supports a safe subset of math:
 *   - Arithmetic: +, -, *, /
 *   - Parentheses
 *   - Variable references (qty, avg_cost, ltp, prev_close, etc.)
 *   - No function calls, no assignments, no side effects
 *
 * Used by:
 *   - Backend portfolio aggregation (portfolio.service.ts)
 *   - Frontend real-time display (when quote ticks arrive)
 */

export interface ComputedColumnDef {
  slug: string;
  name: string;
  expression: string;
  inputVars: string[];
  outputType: 'MONEY' | 'PERCENT' | 'NUMBER';
  sortOrder: number;
}

export interface FormulaContext {
  qty: number;
  avg_cost: number;
  ltp: number;
  prev_close: number;
  total_portfolio_value?: number;
  [key: string]: number | undefined;
}

export interface ComputedResult {
  slug: string;
  name: string;
  value: number | null;
  outputType: 'MONEY' | 'PERCENT' | 'NUMBER';
}

/**
 * Compute all formulas against a context (one holding's data).
 * Formulas can reference other formulas' output — computed in sort_order.
 * Division-by-zero results in null.
 */
export function evaluateFormulas(
  context: FormulaContext,
  definitions: ComputedColumnDef[],
): ComputedResult[] {
  const sorted = [...definitions].sort((a, b) => a.sortOrder - b.sortOrder);
  const scope: Record<string, number> = { ...context } as Record<string, number>;
  const results: ComputedResult[] = [];

  for (const def of sorted) {
    try {
      const value = safeCompute(def.expression, scope);
      if (value === null || !isFinite(value)) {
        results.push({ slug: def.slug, name: def.name, value: null, outputType: def.outputType });
      } else {
        results.push({ slug: def.slug, name: def.name, value, outputType: def.outputType });
        scope[def.slug] = value;
      }
    } catch {
      results.push({ slug: def.slug, name: def.name, value: null, outputType: def.outputType });
    }
  }

  return results;
}

/**
 * Safe expression computation — only allows:
 *   - Numbers (including decimals and negatives)
 *   - Variables (alphanumeric + underscore)
 *   - Operators: + - * /
 *   - Parentheses
 *
 * Uses a hand-written recursive descent parser — NO code generation,
 * NO dynamic execution, NO Function constructor.
 */
export function safeCompute(expression: string, scope: Record<string, number>): number | null {
  const tokens = tokenize(expression);
  if (tokens.length === 0) return null;
  const result = parseExpression(tokens, scope, { pos: 0 });
  if (!isFinite(result)) return null;
  return result;
}

// ─── Tokenizer ───────────────────────────────────────────────────────────────

type Token =
  | { type: 'NUMBER'; value: number }
  | { type: 'VAR'; name: string }
  | { type: 'OP'; op: '+' | '-' | '*' | '/' }
  | { type: 'LPAREN' }
  | { type: 'RPAREN' };

function tokenize(expr: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < expr.length) {
    const ch = expr[i]!;
    if (/\s/.test(ch)) { i++; continue; }
    if (ch === '(') { tokens.push({ type: 'LPAREN' }); i++; continue; }
    if (ch === ')') { tokens.push({ type: 'RPAREN' }); i++; continue; }
    if (ch === '+' || ch === '-' || ch === '*' || ch === '/') {
      tokens.push({ type: 'OP', op: ch }); i++; continue;
    }
    if (/[0-9.]/.test(ch)) {
      let num = '';
      while (i < expr.length && /[0-9.]/.test(expr[i]!)) { num += expr[i]; i++; }
      tokens.push({ type: 'NUMBER', value: parseFloat(num) });
      continue;
    }
    if (/[a-zA-Z_]/.test(ch)) {
      let name = '';
      while (i < expr.length && /[a-zA-Z0-9_]/.test(expr[i]!)) { name += expr[i]; i++; }
      tokens.push({ type: 'VAR', name });
      continue;
    }
    i++;
  }
  return tokens;
}

// ─── Recursive Descent Parser (respects operator precedence) ─────────────────

interface ParseState { pos: number; }

function parseExpression(tokens: Token[], scope: Record<string, number>, state: ParseState): number {
  let left = parseTerm(tokens, scope, state);
  while (state.pos < tokens.length) {
    const tok = tokens[state.pos];
    if (tok?.type === 'OP' && (tok.op === '+' || tok.op === '-')) {
      state.pos++;
      const right = parseTerm(tokens, scope, state);
      left = tok.op === '+' ? left + right : left - right;
    } else {
      break;
    }
  }
  return left;
}

function parseTerm(tokens: Token[], scope: Record<string, number>, state: ParseState): number {
  let left = parseUnary(tokens, scope, state);
  while (state.pos < tokens.length) {
    const tok = tokens[state.pos];
    if (tok?.type === 'OP' && (tok.op === '*' || tok.op === '/')) {
      state.pos++;
      const right = parseUnary(tokens, scope, state);
      if (tok.op === '/') {
        if (right === 0) return NaN;
        left = left / right;
      } else {
        left = left * right;
      }
    } else {
      break;
    }
  }
  return left;
}

function parseUnary(tokens: Token[], scope: Record<string, number>, state: ParseState): number {
  const tok = tokens[state.pos];
  if (tok?.type === 'OP' && tok.op === '-') {
    state.pos++;
    return -parsePrimary(tokens, scope, state);
  }
  if (tok?.type === 'OP' && tok.op === '+') {
    state.pos++;
    return parsePrimary(tokens, scope, state);
  }
  return parsePrimary(tokens, scope, state);
}

function parsePrimary(tokens: Token[], scope: Record<string, number>, state: ParseState): number {
  const tok = tokens[state.pos];
  if (!tok) return 0;

  if (tok.type === 'NUMBER') {
    state.pos++;
    return tok.value;
  }
  if (tok.type === 'VAR') {
    state.pos++;
    const val = scope[tok.name];
    if (val === undefined) return 0;
    return val;
  }
  if (tok.type === 'LPAREN') {
    state.pos++;
    const val = parseExpression(tokens, scope, state);
    if (tokens[state.pos]?.type === 'RPAREN') state.pos++;
    return val;
  }
  state.pos++;
  return 0;
}
