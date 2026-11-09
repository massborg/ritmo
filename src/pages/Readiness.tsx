// Readiness breakdown (update brief 4A.2): the score as a ring, the band word, a short summary, the three-zone bar,
// a swap when readiness and the plan disagree, and what's behind it: each factor's effect against the baseline, which
// add up to the score. Readiness suggests; it never changes the plan without the runner.
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Activity, BedDouble, CloudSun, Flag, Gauge, HeartPulse, Info, Smile, Stethoscope, Timer } from 'lucide-react';
import { useApp } from '../app/AppContext';
import { AppHeader } from '../components/app';
import { CheckInCard, ReadinessBar } from '../components/training';
import { keepPlanToday, keptPlanToday } from '../training/readiness';
import type { FactorKey } from '../training/readiness';

const ICON: Record<FactorKey, typeof Gauge> = { load: Gauge, recovery: Timer, recent: HeartPulse, feel: Smile, checkin: BedDouble, body: Stethoscope, race: Flag, limit: Activity };
const TONE = { good: 'var(--success)', neutral: 'var(--ink-muted)', warn: 'var(--warning)', bad: 'var(--danger)' } as const;
const BAND_COLOUR = { recover: 'var(--danger)', easy: 'var(--warning)', hard: 'var(--success)' } as const;

function Ring({ score, colour }: { score: number; colour: string }) {
  const r = 46, c = 2 * Math.PI * r;
  return (
    <svg width="112" height="112" viewBox="0 0 112 112" role="img" aria-label={`Readiness ${score} out of 100`}>
      <circle cx="56" cy="56" r={r} fill="none" stroke="var(--surface-sunken)" strokeWidth="10" />
      <circle cx="56" cy="56" r={r} fill="none" stroke={colour} strokeWidth="10" strokeLinecap="round" strokeDasharray={`${(score / 100) * c} ${c}`} transform="rotate(-90 56 56)" />
      <text x="56" y="64" textAnchor="middle" style={{ font: '500 30px var(--font-mono)', fill: 'var(--ink)' }}>{score}</text>
    </svg>
  );
}

export default function ReadinessPage() {
  const { readinessToday: r, today, swap, plan } = useApp();
  const nav = useNavigate();
  const [checkin, setCheckin] = useState(false);
  const [kept, setKept] = useState(() => keptPlanToday(today));
  const when = `${today.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })} · ${today.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
  const session = r.swap ? plan?.sessions.find((s) => s.id === r.swap!.sessionId) : undefined;
  const max = Math.max(1, ...r.factors.map((f) => Math.abs(f.effect)));
  return (
    <div className="stack-lg">
      <AppHeader title="Readiness" back eyebrow={when}
        right={<button className="icon-btn" aria-label="About readiness" onClick={() => document.getElementById('about')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}><Info size={22} strokeWidth={2} /></button>} />
      {r.score == null ? (
        <div className="card stack-sm" role="status"><p className="title">{r.unavailable}</p><p className="muted">Ritmo found numbers in your training data that can't be right, so it won't show a score built on them. Fixing the run under Fix this run on its page clears this.</p></div>
      ) : (
        <>
          <section className="card stack rd-head" aria-label="Today's readiness">
            <div className="row" style={{ gap: 'var(--s4)', alignItems: 'center' }}>
              <Ring score={r.score} colour={BAND_COLOUR[r.band]} />
              <div className="stack-sm" style={{ gap: 4 }}>
                <p className="title" style={{ color: BAND_COLOUR[r.band] }}>{r.word}</p>
                <p>{r.summary}</p>
                {r.lessAccurate && <p className="caption">Less accurate today: {r.factors.find((f) => f.key === 'checkin')?.value === 'Not logged' ? 'no morning check-in.' : 'not enough history yet.'}</p>}
              </div>
            </div>
            <ReadinessBar score={r.score} labels />
            {r.swap && session && !kept && (
              <div className="stack-sm">
                <p className="caption">Today's plan is {session.title.toLowerCase()}. {r.line}</p>
                <div className="row wrap">
                  <button className="btn btn-graphite" onClick={() => { swap(r.swap!.sessionId, r.swap!.kind); nav('/'); }}>{r.swap.kind === 'easy' ? `Swap to easy ${r.swap.km} km` : 'Swap to rest'}</button>
                  <button className="btn" onClick={() => { keepPlanToday(today); setKept(true); }}>Keep plan</button>
                </div>
                <p className="caption">A swap shows under Plan changes on Training, with the reason.</p>
              </div>
            )}
            {kept && r.swap && <p className="caption">You're keeping today's plan. Take it a little easier if it feels hard.</p>}
          </section>

          <section className="stack-sm" aria-labelledby="behind">
            <div className="row-between"><h2 id="behind" className="title">What's behind it</h2><span className="caption">Effect from {r.baseline}</span></div>
            <ul className="group rd-factors">
              {r.factors.map((f) => {
                const Icon = ICON[f.key];
                return (
                  <li key={f.key} className="rd-factor">
                    <Icon size={20} strokeWidth={2} aria-hidden="true" />
                    <div className="stack-sm" style={{ gap: 4, flex: 1, minWidth: 0 }}>
                      <div className="row-between"><span className="label">{f.name}</span><span className="rd-effect">{f.effect > 0 ? `+${f.effect}` : f.effect < 0 ? `−${Math.abs(f.effect)}` : '0'}</span></div>
                      <span className="caption" style={{ color: TONE[f.tone], fontWeight: 600 }}>{f.value}</span>
                      <span className="rd-fbar" aria-hidden="true"><span style={{ width: `${(Math.abs(f.effect) / max) * 100}%`, background: f.effect < 0 ? TONE[f.tone] : 'var(--success)' }} /></span>
                      <span className="caption">{f.explain}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
            <p className="caption">{r.factors.some((f) => f.effect !== 0)
              ? `${r.baseline} ${r.factors.filter((f) => f.effect !== 0).map((f) => (f.effect < 0 ? `− ${Math.abs(f.effect)}` : `+ ${f.effect}`)).join(' ')} = ${r.score}`
              : `Nothing moved the score from ${r.baseline} today.`}</p>
          </section>
        </>
      )}

      {(
        <div className="banner banner-info banner-stack" role="note" id="about">
          <p><strong>Readiness suggests; it never changes your plan without you.</strong> It is worked out each morning, and again after a new run or check-in, from your training load, recovery, recent runs, how they felt, your check-in and your body.</p>
          <p className="caption">Race preparation (on your race page) is different: it is about how ready you are for the race, not for today.</p>
          <p className="caption"><CloudSun size={14} strokeWidth={2} aria-hidden="true" /> Today's weather isn't part of readiness yet.</p>
        </div>
      )}

      {checkin ? <CheckInCard onDone={() => setCheckin(false)} /> : (
        <button className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => setCheckin(true)}>{r.factors.find((f) => f.key === 'checkin')?.value === 'Not logged' ? 'Add morning check-in' : 'Update morning check-in'}</button>
      )}
      <Link to="/coach" className="caption">Questions? Ask your coach.</Link>
    </div>
  );
}
