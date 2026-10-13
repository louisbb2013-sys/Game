/**
 * A tiny, safe arithmetic evaluator for formulas from notes (no eval()).
 * Supports numbers, variables, + - * / ^, parentheses, unary minus and sqrt/abs/log/ln/sin/cos/tan.
 */
type Tok = { t: 'num'; v: number } | { t: 'id'; v: string } | { t: 'op'; v: string } | { t: '('; v: '(' } | { t: ')'; v: ')' };

const FUNCS: Record<string, (x: number) => number> = {
  sqrt: Math.sqrt,
  abs: Math.abs,
  log: Math.log10,
  ln: Math.log,
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
};

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  const re = /\s*(?:(\d+(?:\.\d+)?(?:e[+-]?\d+)?)|([A-Za-z_][A-Za-z0-9_]*)|([-+*/^×÷·])|(\()|(\)))/y;
  let i = 0;
  while (i < src.length) {
    if (/^\s+$/.test(src.slice(i))) break;
    re.lastIndex = i;
    const m = re.exec(src);
    if (!m) throw new Error(`bad expression near "${src.slice(i)}"`);
    if (m[1]) out.push({ t: 'num', v: Number(m[1]) });
    else if (m[2]) out.push({ t: 'id', v: m[2] });
    else if (m[3]) out.push({ t: 'op', v: m[3] === '×' || m[3] === '·' ? '*' : m[3] === '÷' ? '/' : m[3] });
    else if (m[4]) out.push({ t: '(', v: '(' });
    else out.push({ t: ')', v: ')' });
    i = re.lastIndex;
  }
  return out;
}

export function evaluate(expression: string, vars: Record<string, number>): number {
  const toks = tokenize(expression);
  let p = 0;
  const peek = () => toks[p];

  function primary(): number {
    const tok = toks[p++];
    if (!tok) throw new Error('unexpected end');
    if (tok.t === 'num') return tok.v;
    if (tok.t === 'op' && tok.v === '-') return -power();
    if (tok.t === 'op' && tok.v === '+') return power();
    if (tok.t === '(') {
      const v = sum();
      if (toks[p++]?.t !== ')') throw new Error('missing )');
      return v;
    }
    if (tok.t === 'id') {
      const fn = FUNCS[tok.v];
      if (fn && peek()?.t === '(') {
        p++;
        const v = sum();
        if (toks[p++]?.t !== ')') throw new Error('missing )');
        return fn(v);
      }
      if (tok.v === 'pi') return Math.PI;
      const v = vars[tok.v];
      if (v === undefined) throw new Error(`unknown variable ${tok.v}`);
      return v;
    }
    throw new Error('unexpected token');
  }
  function power(): number {
    const base = primary();
    const t = peek();
    if (t?.t === 'op' && t.v === '^') {
      p++;
      return Math.pow(base, power()); // right-associative
    }
    return base;
  }
  function product(): number {
    let v = power();
    for (let t = peek(); t?.t === 'op' && (t.v === '*' || t.v === '/'); t = peek()) {
      p++;
      v = t.v === '*' ? v * power() : v / power();
    }
    return v;
  }
  function sum(): number {
    let v = product();
    for (let t = peek(); t?.t === 'op' && (t.v === '+' || t.v === '-'); t = peek()) {
      p++;
      v = t.v === '+' ? v + product() : v - product();
    }
    return v;
  }

  const result = sum();
  if (p !== toks.length) throw new Error('trailing input');
  return result;
}

export function isValidExpression(expression: string, symbols: string[]): boolean {
  try {
    const v = evaluate(expression, Object.fromEntries(symbols.map((s) => [s, 1.5])));
    return Number.isFinite(v);
  } catch {
    return false;
  }
}
