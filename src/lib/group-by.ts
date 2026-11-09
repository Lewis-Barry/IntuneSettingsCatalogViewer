/** Map.groupBy needs Safari 17.4 / Chrome 117 / Firefox 119; this runs everywhere. Keeps first-seen key order. */
export function groupBy<T, K>(items: Iterable<T>, keyOf: (item: T) => K): Map<K, T[]> {
  const groups = new Map<K, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    const list = groups.get(key);
    if (list) list.push(item);
    else groups.set(key, [item]);
  }
  return groups;
}
