export type Verdict =
  | { result: "exact" }
  /** Right answer with a small spelling slip. */
  | { result: "close" }
  /**
   * `matched` is set when the answer is correct for some other entry, e.g. a neighbouring
   * country, and `matchedKey` is that entry's key.
   */
  | { result: "wrong"; matched?: string; matchedKey?: string };

export function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/^the /, "")
    .replace(/\bsaint\b/g, "st");
}

/**
 * Checks typed answers against one entry out of a set of similar ones (all country names, or
 * all capitals). Knowing the whole set means a typo is only forgiven when it is closer to the
 * right answer than to any other, so "Niger" never passes for "Nigeria".
 */
export class AnswerSet {
  private entries = new Map<string, string[]>();
  /** Whose answer each accepted form is. */
  private owners = new Map<string, { key: string; label: string }[]>();

  constructor(answers: Iterable<[key: string, label: string, accepted: string[]]>) {
    for (const [key, label, accepted] of answers) {
      const forms = [...new Set(accepted.map(normalize).filter(Boolean))];
      this.entries.set(key, forms);
      for (const f of forms) this.owners.set(f, [...(this.owners.get(f) ?? []), { key, label }]);
    }
  }

  check(key: string, input: string): Verdict {
    const typed = normalize(input);
    const target = this.entries.get(key) ?? [];
    if (!typed) return { result: "wrong" };
    if (target.includes(typed)) return { result: "exact" };

    const owners = this.owners.get(typed);
    if (owners) return { result: "wrong", matched: owners[0].label, matchedKey: owners[0].key };

    const toTarget = Math.min(...target.map((t) => editDistance(typed, t)));
    if (toTarget > allowedTypos(typed.length)) return { result: "wrong" };
    for (const [other, forms] of this.entries) {
      if (other === key) continue;
      if (forms.some((f) => editDistance(typed, f) <= toTarget)) return { result: "wrong" };
    }
    return { result: "close" };
  }
}

function allowedTypos(length: number): number {
  if (length <= 4) return 0;
  if (length <= 7) return 1;
  if (length <= 12) return 2;
  return 3;
}

/** Edit distance where swapping two neighbouring letters ("Indai") counts as one slip. */
function editDistance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 3) return 99;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
}
