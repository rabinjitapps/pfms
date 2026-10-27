/**
 * Tiny, safe evaluator for amount fields that accept addition and subtraction,
 * e.g. "1200 + 350 - 50". No eval(): the input is validated against a strict
 * pattern and summed term by term.
 *
 * Returns null while the expression is incomplete or invalid (e.g. a trailing
 * "+"), so callers can show a live preview only when there's a real result.
 */
export function evaluateAmountExpr(raw: string): number | null {
  const cleaned = raw
    .replace(/[₹,\s]/g, '')
    .replace(/[−–—]/g, '-') // typographic minus signs
    .replace(/＋/g, '+');

  if (cleaned === '') return null;

  // optional leading sign, then number, then any number of (+|-) number
  const NUM = '(?:\\d+\\.?\\d*|\\.\\d+)';
  if (!new RegExp(`^[+-]?${NUM}(?:[+-]${NUM})*$`).test(cleaned)) return null;

  const terms = cleaned.match(new RegExp(`[+-]?${NUM}`, 'g'));
  if (!terms) return null;

  const total = terms.reduce((sum, t) => sum + Number(t), 0);
  if (!Number.isFinite(total)) return null;
  return Math.round(total * 100) / 100;
}

/** True when the text contains an operator after the first character. */
export function hasOperator(raw: string): boolean {
  return /[+\-−–—]/.test(raw.trim().slice(1));
}
