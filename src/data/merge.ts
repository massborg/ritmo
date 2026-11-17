// Three-way merge for data that can be changed in two places at once (two tabs, two devices, or a device that was
// offline). `base` is what both sides started from, `mine` is this device, `theirs` is the account.
// Rule: a side that did not change a value gives way to the side that did. When both changed it, lists of items
// with an id are merged item by item, objects are merged key by key, and for anything else this device wins
// (it is the change the runner has just made).

type Json = unknown;
const same = (a: Json, b: Json) => JSON.stringify(a) === JSON.stringify(b);
const isObj = (v: Json): v is Record<string, Json> => !!v && typeof v === 'object' && !Array.isArray(v);
const isIdList = (v: Json): v is { id: string }[] => Array.isArray(v) && v.every((x) => isObj(x) && typeof x.id === 'string');

export function merge3<T>(base: T | undefined, mine: T, theirs: T): T {
  if (same(mine, theirs)) return mine;
  if (same(mine, base)) return theirs;
  if (same(theirs, base)) return mine;
  if (isIdList(mine) && isIdList(theirs)) {
    const b = new Map((isIdList(base) ? base : []).map((x) => [x.id, x]));
    const t = new Map(theirs.map((x) => [x.id, x]));
    const seen = new Set<string>();
    const out: { id: string }[] = [];
    // This device's order first, then items only the account has
    for (const m of mine) {
      seen.add(m.id);
      const th = t.get(m.id), ba = b.get(m.id);
      if (!th) { if (ba && same(ba, m)) continue; out.push(m); } // deleted in the account and untouched here: stays deleted
      else out.push(merge3(ba, m, th));
    }
    for (const th of theirs) {
      if (seen.has(th.id)) continue;
      const ba = b.get(th.id);
      if (ba && same(ba, th)) continue; // deleted here and untouched in the account: stays deleted
      out.push(th);
    }
    return out as unknown as T;
  }
  if (isObj(mine) && isObj(theirs)) {
    const b: Record<string, Json> = isObj(base) ? base : {};
    const out: Record<string, Json> = {};
    for (const k of new Set([...Object.keys(mine), ...Object.keys(theirs)])) {
      const v = merge3(b[k], mine[k], theirs[k]);
      if (v !== undefined) out[k] = v;
    }
    return out as T;
  }
  return mine;
}
