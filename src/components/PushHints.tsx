// What the reminder server can't work out itself (update 2, §15): today's readiness, for "Low readiness", and how worn
// each pair of shoes is, for "Shoes nearly worn out". Saved with the profile once a day or when it changes, and only
// while reminders are on.
import { useEffect, useRef } from 'react';
import { useApp } from '../app/AppContext';
import { ymd } from '../lib/format';
import { shoeTotals } from '../training/shoes';
import { forStats } from '../data/quality';

export function PushHints() {
  const { data, readinessToday, typeOf, updateProfile } = useApp();
  const on = data.mode === 'real' && !!data.profile.reminders;
  const fns = useRef({ typeOf, updateProfile });
  fns.current = { typeOf, updateProfile };
  const score = readinessToday.score;
  const band = readinessToday.band;
  const shoesOn = !!data.profile.reminders?.shoes;
  useEffect(() => {
    if (!on) return;
    const t = setTimeout(() => {
      const today = ymd(new Date());
      const readiness = score != null && !readinessToday.unavailable ? { date: today, score: Math.round(score), band } : undefined;
      const shoes = shoesOn ? (() => {
        const list = (data.profile.shoes ?? []).filter((s) => !s.retired && s.retireKm > 0);
        const km = shoeTotals(forStats(data.activities), list, fns.current.typeOf);
        return list.map((s) => ({ id: s.id, name: s.name, pct: Math.round(((km.get(s.id) ?? s.startKm ?? 0) / s.retireKm) * 100) }));
      })() : undefined;
      const next = { readiness, shoes };
      if (JSON.stringify(next) !== JSON.stringify(data.profile.pushHints ?? {})) fns.current.updateProfile({ pushHints: next });
    }, 4000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, score, band, shoesOn, data.activities, data.profile.shoes]);
  return null;
}
