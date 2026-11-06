// The detailed data (streams, laps) of one run, fetched from the account when a run is opened.
// Run summaries are what the app loads for the whole history; this fills in the detail for one run.
import { useEffect, useState } from 'react';
import type { Activity } from '../lib/types';
import { fetchRunDetail } from '../data/store';

const cache = new Map<string, Pick<Activity, 'streams' | 'laps'>>();
const MAX = 30;

export function useRunDetail(a: Activity | undefined, enabled: boolean): { run: Activity | undefined; loading: boolean } {
  const need = !!a && enabled && !a.streams && !a.laps && !cache.has(a.id);
  const [, setTick] = useState(0);
  const [loading, setLoading] = useState(need);
  useEffect(() => {
    if (!a || !need) { setLoading(false); return; }
    let live = true;
    setLoading(true);
    fetchRunDetail(a.id)
      .then((d) => {
        cache.set(a.id, d ?? {});
        if (cache.size > MAX) cache.delete(cache.keys().next().value as string);
      })
      .catch((e) => console.warn('Could not load this run’s detail', e))
      .finally(() => { if (live) { setLoading(false); setTick((x) => x + 1); } });
    return () => { live = false; };
  }, [a?.id, need]); // eslint-disable-line react-hooks/exhaustive-deps
  const d = a && cache.get(a.id);
  return { run: a && d && !a.streams && !a.laps ? { ...a, ...d } : a, loading };
}
