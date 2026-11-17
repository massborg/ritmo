// HYROX (update 4, task 5): choose what to record. Simulate (full, half or custom), Station practice, or Race day
// (enter the official splits, or record it live). Division, treadmill or GPS runs, swaps for missing equipment and
// Roxzone timing are kept for next time. Past sessions and records are listed below.
import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { get, del } from 'idb-keyval';
import { ArrowDown, ArrowUp, ChevronRight, Pencil, Trash2 } from 'lucide-react';
import { useApp } from '../app/AppContext';
import { AppHeader } from '../components/app';
import { Chips, DateField, Sheet } from '../components/inputs';
import { DurationInput } from '../components/TimeEntry';
import { NumInput } from '../components/StrengthBits';
import { StatusLine } from '../components/ui';
import { DIVISIONS, HYROX_SEASON, RUN_M, STATIONS, divisionLabel, loadFor, stationByKey, type Division, type StationKey } from '../hyrox/hyroxDivisions';
import { MODE_LABEL, clock, enteredRace, hasAmounts, practicePlan, records, renumberRuns, segmentName, segmentWork, simulationPlan, startLive, stationPlan, swapWork, type HyroxMode, type HyroxSession, type HyroxTemplate, type Live, type SegmentPlan } from '../hyrox/hyrox';
import { liveKey, loadLive, saveLive } from '../hyrox/live-store';
import { resetVoice, unlockAudio } from '../run/cues';
import { longDate, parseYmd, ymd } from '../lib/format';

type Tab = 'simulate' | 'practice' | 'race';
type Sim = 'full' | 'half_front' | 'half_back' | 'custom';
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

export default function Hyrox() {
  const { data, session, setHyroxPrefs, saveHyrox } = useApp();
  const nav = useNavigate();
  const prefs = data.profile.hyrox ?? {};
  const division: Division = prefs.division ?? 'men_open';
  const roxzone = prefs.roxzone ?? false, indoor = prefs.indoor ?? false, swaps = prefs.swaps ?? {};
  const [params] = useSearchParams();
  const [tab, setTab] = useState<Tab>(params.get('tab') === 'race' ? 'race' : params.get('tab') === 'practice' ? 'practice' : 'simulate');
  // ?sim=half: Start on a planned half simulation opens with the half selected, not the full one
  const simParam = params.get('sim');
  const [sim, setSim] = useState<Sim>(simParam === 'half' || simParam === 'half_front' ? 'half_front' : simParam === 'half_back' ? 'half_back' : 'full');
  const [sheet, setSheet] = useState<'division' | 'swaps'>();
  const [goalS, setGoalS] = useState<number | undefined>(prefs.goalS);
  // Custom
  const [custom, setCustom] = useState<SegmentPlan[]>(() => simulationPlan('half_front', division, swaps));
  const [customName, setCustomName] = useState('');
  const [templateId, setTemplateId] = useState<string>();
  // Practice
  const [station, setStation] = useState<StationKey>('wall_balls');
  const [repeats, setRepeats] = useState(1);
  // Race day
  const [raceDate, setRaceDate] = useState(ymd(new Date()));
  const [runs, setRuns] = useState<(number | undefined)[]>(Array(8).fill(undefined));
  const [stn, setStn] = useState<(number | undefined)[]>(Array(8).fill(undefined));
  const [roxS, setRoxS] = useState<number>();
  const [finishS, setFinishS] = useState<number>();
  const [badSplits, setBadSplits] = useState<string[]>([]);
  // A session left on this device: unfinished (the app closed or the page reloaded), or finished but not saved yet
  const key = liveKey(session?.user.id);
  const [unfinished, setUnfinished] = useState<Live>();
  useEffect(() => { get(key).then((v) => { if (v) setUnfinished(v as Live); }).catch(() => {}); }, [key]);

  const sessions = (data.profile.log ?? []).filter((e) => e.kind === 'hyrox' && e.hyrox).map((e) => e.hyrox as HyroxSession).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const rec = records(sessions);
  const templates = prefs.templates ?? [];

  const begin = async (mode: HyroxMode, plan: SegmentPlan[], title: string, tId?: string) => {
    if (!plan.length) return;
    resetVoice(); unlockAudio();
    // A session still kept on this device (unfinished, or finished and not saved) is never replaced without asking
    const kept = await loadLive(key);
    if (kept && !window.confirm(`${kept.title} is still on this device and not saved. Start a new session and discard it?`)) { setUnfinished(kept); return; }
    // The goal typed here is for this session only: the race goal lives in Profile, HYROX, and is never overwritten
    setHyroxPrefs({ division });
    const live = startLive({ id: uid(), title, mode, division, plan, roxzone, indoor, goalMs: (mode === 'full' || mode === 'race') && goalS ? goalS * 1000 : undefined, templateId: tId }, Date.now());
    await saveLive(key, live);
    nav('/hyrox/live');
  };
  const startSim = () => {
    if (sim === 'custom') return begin('custom', renumberRuns(fresh(custom)), customName.trim() ? `HYROX · ${customName.trim()}` : MODE_LABEL.custom, templateId);
    return begin(sim, simulationPlan(sim, division, swaps), `${MODE_LABEL[sim]} · ${divisionLabel(division)}`);
  };
  // Stations in the custom list follow the swaps and the division as they are now (not as they were when the
  // list or a saved session was made), so a swapped station is marked and never counts toward records
  const fresh = (l: SegmentPlan[]): SegmentPlan[] => l.map((p) => (p.kind === 'station' ? { ...stationPlan(p.key as StationKey, division, swaps, p.n), distanceM: p.distanceM, reps: p.reps } : p));
  // A run or station with no metres or reps cannot be started or saved
  const customOk = hasAmounts(fresh(custom));
  const saveCustom = () => {
    const name = customName.trim() || 'My HYROX session';
    const id = templateId ?? uid();
    const was = templates.find((t) => t.id === id);
    const t: HyroxTemplate = { id, name, segments: renumberRuns(fresh(custom)), createdAt: was?.createdAt ?? new Date().toISOString(), lastUsedAt: was?.lastUsedAt };
    setHyroxPrefs({ templates: was ? templates.map((x) => (x.id === id ? t : x)) : [...templates, t] });
    setTemplateId(id); setCustomName(name);
  };
  const moveSeg = (i: number, d: -1 | 1) => setCustom((l) => { const j = i + d; if (j < 0 || j >= l.length) return l; const n = [...l]; [n[i], n[j]] = [n[j], n[i]]; return n; });
  const patchSeg = (i: number, p: Partial<SegmentPlan>) => setCustom((l) => l.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const addRun = () => setCustom((l) => [...l, { kind: 'run', key: 'run', n: l.filter((x) => x.kind === 'run').length + 1, distanceM: RUN_M }]);
  // Splits typed with seconds or minutes over 59 are not times. They must be fixed before saving, or they would
  // drop out of the total and the records without a word.
  const splitErr = (id: string) => (e: 'seconds' | 'minutes' | undefined) => setBadSplits((b) => (!!e === b.includes(id) ? b : e ? [...b, id] : b.filter((x) => x !== id)));
  const raceOk = runs.filter(Boolean).length + stn.filter(Boolean).length >= 1 && !badSplits.length;
  const racePartial = runs.filter(Boolean).length + stn.filter(Boolean).length < 16 || (!roxS && !finishS);
  const saveRace = () => {
    const h = enteredRace({ id: uid(), date: raceDate, division, runs, stations: stn, roxzoneS: roxS, finishS, goalMs: goalS ? goalS * 1000 : undefined });
    saveHyrox(h);
    nav(`/hyrox/session/${h.id}`);
  };
  const swapCount = Object.values(swaps).filter(Boolean).length;
  const Mode = ({ value, badge, title, sub }: { value: Sim; badge: React.ReactNode; title: string; sub: string }) => (
    <button type="button" className={`choice hyrox-mode${sim === value ? ' on' : ''}`} aria-pressed={sim === value} onClick={() => setSim(value)}>
      <span className="hyrox-badge" aria-hidden="true">{badge}</span>
      <span className="stack-sm" style={{ gap: 0 }}><span className="label">{title}</span><span className="caption">{sub}</span></span>
    </button>
  );

  return (
    <div className="stack-lg hyrox-page" style={{ maxWidth: 720 }}>
      <AppHeader title="HYROX" eyebrow={`Season ${HYROX_SEASON}`} back />
      {unfinished && (
        <section className="card stack-sm" aria-label="Unfinished session">
          <StatusLine kind="info">{unfinished.finishedAt ? 'A finished session is on this device and not saved yet' : 'An unfinished session is saved on this device'}: {unfinished.title}, {unfinished.done.filter((s) => s.kind !== 'roxzone').length} of {unfinished.plan.length} segments done.</StatusLine>
          <div className="row wrap" style={{ gap: 8 }}>
            <Link to="/hyrox/live" className="btn btn-primary">{unfinished.finishedAt ? 'Save it' : 'Carry on'}</Link>
            <button type="button" className="btn btn-ghost" onClick={() => { void del(key); setUnfinished(undefined); }}>Discard it</button>
          </div>
        </section>
      )}
      <div className="text-tabs" role="tablist" aria-label="What to record">
        {([['simulate', 'Simulate'], ['practice', 'Station practice'], ['race', 'Race day']] as [Tab, string][]).map(([v, l]) => <button key={v} role="tab" aria-selected={tab === v} className="text-tab" onClick={() => setTab(v)}>{l}</button>)}
      </div>

      {tab === 'simulate' && (
        <section className="stack-sm" aria-label="Simulate">
          <Mode value="full" badge="8" title="Full simulation" sub="8 × (1 km run + station). The full race in order." />
          <Mode value="half_front" badge="4" title="Half simulation: front" sub="Runs 1–4 with SkiErg, sled push, sled pull, burpee broad jumps." />
          <Mode value="half_back" badge="4" title="Half simulation: back" sub="Runs 5–8 with row, farmers carry, sandbag lunges, wall balls." />
          <Mode value="custom" badge={<Pencil size={18} />} title="Custom" sub="Choose runs, stations, order and reps. Save it for next time." />
          {sim === 'custom' && (
            <div className="card stack">
              {templates.length > 0 && (
                <div className="row wrap" role="group" aria-label="Saved sessions" style={{ gap: 6 }}>
                  {templates.map((t) => <button key={t.id} type="button" className="chip" aria-pressed={templateId === t.id} onClick={() => { setCustom(t.segments); setCustomName(t.name); setTemplateId(t.id); }}>{t.name}</button>)}
                </div>
              )}
              <ol className="build-list">
                {fresh(custom).map((p, i) => (
                  <li key={i} className="build-row">
                    <div className="row-between" style={{ gap: 8 }}>
                      <span className="label">{i + 1}. {p.kind === 'run' ? 'Run' : segmentName(p)}</span>
                      <span className="row" style={{ gap: 0 }}>
                        <button type="button" className="icon-btn" aria-label={`Move segment ${i + 1} up`} disabled={i === 0} onClick={() => moveSeg(i, -1)}><ArrowUp size={18} /></button>
                        <button type="button" className="icon-btn" aria-label={`Move segment ${i + 1} down`} disabled={i === custom.length - 1} onClick={() => moveSeg(i, 1)}><ArrowDown size={18} /></button>
                        <button type="button" className="icon-btn" aria-label={`Remove segment ${i + 1}`} onClick={() => setCustom((l) => l.filter((_, j) => j !== i))}><Trash2 size={18} /></button>
                      </span>
                    </div>
                    <div className="build-dose">
                      {/* A swapped station has its own work; reps or metres follow the station, so an emptied field stays empty */}
                      {p.swapped
                        ? <span className="caption">{swapWork(p)} · instead of {stationByKey.get(p.key as StationKey)?.name.toLowerCase()}</span>
                        : p.kind === 'station' && stationByKey.get(p.key as StationKey)?.reps != null
                          ? <label><span className="caption">Reps</span><NumInput label={`Reps for segment ${i + 1}`} value={p.reps} max={500} onChange={(v) => patchSeg(i, { reps: v })} /></label>
                          : <label><span className="caption">Metres</span><NumInput label={`Metres for segment ${i + 1}`} value={p.distanceM} max={5000} onChange={(v) => patchSeg(i, { distanceM: v })} /></label>}
                    </div>
                  </li>
                ))}
              </ol>
              {!custom.length && <p className="muted">Add runs and stations below.</p>}
              {custom.length > 0 && !customOk && <p className="caption" role="status">Give every run and station its metres or reps (more than 0) before you start or save.</p>}
              <div className="row wrap" style={{ gap: 6 }}>
                <button type="button" className="chip" onClick={addRun}>+ Run</button>
                {STATIONS.map((s) => <button key={s.key} type="button" className="chip" onClick={() => setCustom((l) => [...l, stationPlan(s.key, division, swaps)])}>+ {s.name}</button>)}
              </div>
              <div className="field"><label htmlFor="hx-name">Name, to save it</label><input id="hx-name" className="input" maxLength={40} placeholder="Sled and lunge day" value={customName} onChange={(e) => setCustomName(e.target.value)} /></div>
              <div className="row wrap" style={{ gap: 8 }}>
                <button type="button" className="btn" disabled={!custom.length || !customOk || !customName.trim()} onClick={saveCustom}>{templateId ? 'Save changes' : 'Save for next time'}</button>
                {templateId && <button type="button" className="btn btn-ghost" onClick={() => { setHyroxPrefs({ templates: templates.filter((t) => t.id !== templateId) }); setTemplateId(undefined); setCustomName(''); }}>Delete saved session</button>}
              </div>
            </div>
          )}
        </section>
      )}

      {tab === 'practice' && (
        <section className="card stack" aria-label="Station practice">
          <Chips<StationKey> label="Station" value={station} onChange={setStation} options={STATIONS.map((s) => ({ value: s.key, label: s.name }))} />
          <p className="caption">{segmentWork(stationPlan(station, division, swaps), division)}{rec.stations[station] ? ` · your best ${clock(rec.stations[station]!.ms)}` : ''}</p>
          <Chips<number> label="Repeats" value={repeats} onChange={setRepeats} options={[1, 2, 3, 4, 5].map((n) => ({ value: n, label: n === 1 ? 'Once' : `${n} times` }))} />
          {repeats > 1 && <p className="caption">Each repeat is timed, with a rest between. Tap when the rest is over.</p>}
        </section>
      )}

      {tab === 'race' && (
        <section className="card stack" aria-label="Race day">
          <Link to="/hyrox/race-day" className="btn btn-small" style={{ alignSelf: 'flex-start' }}>Race-day plan: pacing and warm-up</Link>
          <p className="caption">After the race, enter your official splits. Or record it live with the button below: put the phone somewhere you can tap it at each station.</p>
          <DateField id="hx-date" label="Race date" value={raceDate} onChange={setRaceDate} />
          <div className="race-splits">
            {STATIONS.map((s, i) => (
              <div key={s.key} className="race-split-row">
                <label className="race-split"><span className="caption">Run {s.n}</span><DurationInput small id={`hx-run-${s.n}`} label={`Run ${s.n} time`} value={runs[i]} onError={splitErr(`run-${i}`)} onChange={(v) => setRuns((a) => a.map((x, j) => (j === i ? v : x)))} /></label>
                <label className="race-split"><span className="caption">{s.name}</span><DurationInput small id={`hx-st-${s.n}`} label={`${s.name} time`} value={stn[i]} onError={splitErr(`st-${i}`)} onChange={(v) => setStn((a) => a.map((x, j) => (j === i ? v : x)))} /></label>
              </div>
            ))}
            <div className="race-split-row">
              <label className="race-split"><span className="caption">Roxzone, total</span><DurationInput small id="hx-rox" label="Roxzone total time" value={roxS} onError={splitErr('rox')} onChange={setRoxS} /></label>
              <label className="race-split"><span className="caption">Finish time</span><DurationInput small id="hx-finish" label="Official finish time" value={finishS} onError={splitErr('finish')} onChange={setFinishS} /></label>
            </div>
          </div>
          {raceOk && racePartial && <p className="caption">Without every split and the Roxzone total or finish time, this is saved as a partial result: it is not compared with your goal or counted as your best race.</p>}
          {badSplits.length > 0 && <p className="caption" role="alert" style={{ color: 'var(--danger)' }}>Fix the times marked in red: seconds and minutes must be under 60.</p>}
          <button type="button" className="btn btn-block" disabled={!raceOk} onClick={saveRace}>Save race result</button>
        </section>
      )}

      <section className="card hyrox-settings" aria-label="Settings">
        <button type="button" className="hx-row" onClick={() => setSheet('division')}><span>Division</span><strong>{divisionLabel(division)}</strong></button>
        <button type="button" className="hx-row" role="switch" aria-checked={indoor} onClick={() => setHyroxPrefs({ indoor: !indoor })}><span>Runs</span><strong>{indoor ? 'Treadmill or indoor: time only' : 'GPS distance'}</strong></button>
        <button type="button" className="hx-row" onClick={() => setSheet('swaps')}><span>Missing equipment?</span><strong>{swapCount ? `${swapCount} swap${swapCount > 1 ? 's' : ''}` : 'No swaps'}</strong></button>
        <button type="button" className="hx-row" role="switch" aria-checked={roxzone} onClick={() => setHyroxPrefs({ roxzone: !roxzone })}><span>Roxzone timing</span><strong>{roxzone ? 'On' : 'Off'}</strong></button>
        {(tab === 'race' || (tab !== 'practice' && sim === 'full')) && <div className="hx-row"><label htmlFor="hx-goal">Goal for this session (optional)</label><DurationInput small id="hx-goal" label="Goal time" value={goalS} onChange={setGoalS} /></div>}
      </section>
      <p className="caption">Station loads follow your division. Swapped stations are marked, so they don't count toward records. {roxzone ? 'Roxzone timing: tap when you arrive at a station, then again when you start it.' : 'With Roxzone timing off, transitions count as part of the run.'}</p>

      {tab === 'simulate' && <button type="button" className="btn btn-primary btn-block hyrox-start" disabled={sim === 'custom' && (!custom.length || !customOk)} onClick={() => void startSim()}>Start {sim === 'custom' ? 'session' : 'simulation'}</button>}
      {tab === 'practice' && <button type="button" className="btn btn-primary btn-block hyrox-start" onClick={() => void begin('practice', practicePlan(station, repeats, division, swaps), `${stationByKey.get(station)!.name} practice`)}>Start practice</button>}
      {tab === 'race' && <button type="button" className="btn btn-primary btn-block hyrox-start" onClick={() => void begin('race', simulationPlan('race', division), `HYROX race · ${divisionLabel(division)}`)}>Record the race live</button>}

      {(rec.simulation || rec.race || rec.run || Object.keys(rec.stations).length > 0) && (
        <section className="card stack-sm" aria-labelledby="hx-rec">
          <h2 id="hx-rec" className="title">Your records</h2>
          <ul className="list">
            {rec.race && <li className="list-item row-between"><span className="label">Best race</span><span className="stat">{clock(rec.race.ms)}</span></li>}
            {rec.simulation && <li className="list-item row-between"><span className="label">Best full simulation</span><span className="stat">{clock(rec.simulation.ms)}</span></li>}
            {rec.run && <li className="list-item row-between"><span className="label">Best 1 km run split</span><span className="stat">{clock(rec.run.ms)}</span></li>}
            {STATIONS.filter((s) => rec.stations[s.key]).map((s) => <li key={s.key} className="list-item row-between"><span className="label">{s.name}</span><span className="stat">{clock(rec.stations[s.key]!.ms)}</span></li>)}
          </ul>
        </section>
      )}
      {sessions.length > 0 && (
        <section className="stack-sm" aria-labelledby="hx-past">
          <h2 id="hx-past" className="title">Your sessions</h2>
          <ul className="list">
            {sessions.slice(0, 20).map((h) => (
              <li key={h.id}><Link to={`/hyrox/session/${h.id}`} className="list-item row-between"><span className="stack-sm" style={{ gap: 0 }}><span className="label">{h.title}</span><span className="caption">{longDate(parseYmd(ymd(new Date(h.startedAt))))}</span></span><span className="row" style={{ gap: 4 }}><span className="stat">{clock(h.totalMs)}</span><ChevronRight size={16} aria-hidden="true" /></span></Link></li>
            ))}
          </ul>
        </section>
      )}

      {sheet === 'division' && (
        <Sheet open onClose={() => setSheet(undefined)} title="Division">
          <div className="stack-sm">
            {DIVISIONS.map((d) => (
              <button key={d.value} type="button" className={`choice${division === d.value ? ' on' : ''}`} aria-pressed={division === d.value} onClick={() => { setHyroxPrefs({ division: d.value }); setSheet(undefined); }}>
                <span className="label">{d.label}</span>
                <span className="caption">Sled push {loadFor(d.value, 'sled_push')?.text} · wall ball {loadFor(d.value, 'wall_balls')?.text}{d.note ? ` · ${d.note}` : ''}</span>
              </button>
            ))}
          </div>
        </Sheet>
      )}
      {sheet === 'swaps' && (
        <Sheet open onClose={() => setSheet(undefined)} title="Missing equipment?">
          <div className="stack">
            <p className="caption">Pick what you will do instead. A swapped station is marked in the session and left out of your records.</p>
            {STATIONS.filter((s) => s.swaps.length).map((s) => (
              <div key={s.key} className="field">
                <label htmlFor={`hx-swap-${s.key}`}>{s.name}</label>
                <select id={`hx-swap-${s.key}`} className="input" value={swaps[s.key] ?? ''} onChange={(e) => setHyroxPrefs({ swaps: { ...swaps, [s.key]: e.target.value || undefined } })}>
                  <option value="">I have it</option>
                  {s.swaps.map((w) => <option key={w.id} value={w.id}>{w.name} ({w.work})</option>)}
                </select>
              </div>
            ))}
          </div>
        </Sheet>
      )}
    </div>
  );
}
