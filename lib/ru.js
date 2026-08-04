/**
 * Russian noun agreement after a number.
 *
 * 1 слово · 2 слова · 5 слов · 21 слово · 11 слов
 *
 * plural(n, "слово", "слова", "слов")
 */
export function plural(n, one, few, many) {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  let form;
  if (abs > 10 && abs < 20) form = many;
  else if (last > 1 && last < 5) form = few;
  else if (last === 1) form = one;
  else form = many;
  return `${n} ${form}`;
}
