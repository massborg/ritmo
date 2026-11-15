// Your strength plan (update 3, §9): the current block and week (a bar chart of learn, build, load, lighter), this
// week's focus, how each movement gets harder across blocks, and the last session's result with the next change.
import { Link } from 'react-router-dom';
import { useApp } from '../app/AppContext';
import { AppHeader } from '../components/app';
import { blockOf, exById, resolveStrength, ROUTINE_TITLE, skippedInARow, targetFor, WEEK_FOCUS, type BlockWeek } from '../training/strength';
import { longDate, parseYmd, ymd } from '../lib/format';

const HEIGHT: Record<BlockWeek, number> = { 1: 45, 2: 65, 3: 90, 4: 35 };

export default function StrengthPlan() {
  const { plan, data } = useApp();
  const t = ymd(new Date());
  const prefs = data.profile.strength ?? {};
  const { block, week } = blockOf(plan?.weeks, t);
  const logs = (data.profile.log ?? []).filter((e) => e.kind === 'strength' && e.strength).sort((a, b) => b.at.localeCompare(a.at));
  const logged = new Set(logs.map((e) => e.strength!.sessionId).filter(Boolean) as string[]);
  const skips = skippedInARow(plan?.sessions ?? [], logged, t);
  const next = (plan?.sessions ?? []).filter((s) => s.strengthPlan && s.date >= t && !logged.has(s.id)).sort((a, b) => a.date.localeCompare(b.date))[0];
  // Every exercise in this runner's sessions (routines A and B), as each block makes it harder (update 4): a harder
  // version of the movement, or more reps and then another set when there is none
  const tables = (['A', 'B'] as const).map((routine) => {
    const at = (b: number) => resolveStrength({ routine, intensity: 'heavy', why: '' }, prefs, { block: b, week: 1 }).items;
    const cols = [at(1), at(2), at(3)];
    const cell = (x?: (typeof cols)[number][number]) => (x ? `${x.ex.name}${x.harder ? ` ${x.harder}` : ''}` : '–');
    return { routine, title: ROUTINE_TITLE[routine], rows: cols[0].map((_, i) => cols.map((c) => cell(c[i]))) };
  });
  const last = logs[0];
  // A long wait for the next session is explained (update 4): a race or taper, or how the week is laid out
  const gapWhy = (() => {
    if (!next) return undefined;
    const lastDate = [last?.date, ...(plan?.sessions ?? []).filter((x) => x.strengthPlan && x.date < t).map((x) => x.date)].filter(Boolean).sort().pop();
    if (!lastDate) return undefined;
    const gap = Math.round((parseYmd(next.date).getTime() - parseYmd(lastDate).getTime()) / 86400000);
    if (gap <= 8) return undefined;
    const race = data.races.filter((r) => r.date >= t).sort((a, b) => a.date.localeCompare(b.date))[0];
    const toRace = race ? Math.round((parseYmd(race.date).getTime() - parseYmd(next.date).getTime()) / 86400000) : 99;
    const perWeek = data.profile.training?.strengthPerWeek;
    return `That is ${gap} days after your last one. ${next.phase === 'taper' || toRace <= 14
      ? `Strength is lighter in the taper and stops 4 days before ${race?.name ?? 'your race'}, so your legs are fresh.`
      : `Your plan has ${perWeek === 1 ? 'one strength session' : `${perWeek ?? 'a few'} strength sessions`} a week, placed away from hard and long runs. Add one any time from the + menu.`}`;
  })();
  return (
    <div className="stack-lg" style={{ maxWidth: 720 }}>
      <AppHeader title="Your strength plan" eyebrow={`Block ${block} · week ${week} of 4`} back />
      <section className="card stack" aria-labelledby="sp-block">
        <h2 id="sp-block" className="title">Block {block}, week {week}: {WEEK_FOCUS[week].name}</h2>
        <div className="block-bars" role="img" aria-label={`Weeks of block ${block}: learn, build, load, lighter. This is week ${week}.`}>
          {([1, 2, 3, 4] as BlockWeek[]).map((w) => (
            <div key={w} className={`block-bar${w === week ? ' now' : ''}`}>
              <span style={{ height: `${HEIGHT[w]}%` }} />
              <span className="caption">{WEEK_FOCUS[w].name}</span>
            </div>
          ))}
        </div>
        <p><strong>This week: </strong>{WEEK_FOCUS[week].focus}</p>
        <p className="caption">The lighter week lines up with your lighter running weeks and race weeks. A new block brings harder versions of each movement.</p>
        {skips >= 2 && <p className="caption">Two planned sessions were skipped, so the next one steps back a little.</p>}
        {next && <Link to={`/session/${next.id}`} className="btn btn-small" style={{ alignSelf: 'flex-start' }}>Next session: {longDate(parseYmd(next.date))}</Link>}
        {gapWhy && <p className="caption strength-gap">{gapWhy}</p>}
      </section>

      <section className="card stack" aria-labelledby="sp-ladder">
        <h2 id="sp-ladder" className="title">How your exercises progress</h2>
        {tables.map((tb) => (
          <div key={tb.routine} className="table-wrap">
            <table className="ladder-table">
              <caption className="label" style={{ textAlign: 'left', paddingBottom: 4 }}>{tb.title}</caption>
              <thead><tr><th scope="col">Block 1</th><th scope="col">Block 2</th><th scope="col">Block 3</th></tr></thead>
              <tbody>{tb.rows.map((r, ri) => <tr key={ri}>{r.map((name, i) => <td key={i} className={i + 1 === Math.min(3, block) ? 'now' : undefined}>{name}</td>)}</tr>)}</tbody>
            </table>
          </div>
        ))}
        <p className="caption">Every exercise in your sessions is listed. Each block is harder: a harder version of the movement, or more reps and then another set when there isn't one. Your swaps and "Never give me…" list are respected.</p>
      </section>

      <section className="card stack" aria-labelledby="sp-last">
        <h2 id="sp-last" className="title">Last session</h2>
        {last ? (
          <>
            <p className="caption">{last.strength!.title} · {longDate(parseYmd(last.date))}{last.rpe ? ` · effort ${last.rpe}/10` : ''}</p>
            <ul className="list">
              {last.strength!.exercises.map((x) => {
                const pr = prefs.progress?.[x.id];
                const ex = exById.get(x.id);
                const nx = ex && pr ? targetFor({ id: x.id, sets: x.planned ?? x.sets.length, reps: ex.reps, seconds: ex.seconds }, pr, week).note : undefined;
                const first = x.sets[0] ?? {};
                return (
                  <li key={x.id} className="list-item row-between" style={{ alignItems: 'flex-start' }}>
                    <span className="stack-sm" style={{ gap: 0 }}><span className="label">{x.name}</span><span className="caption">{x.sets.length}{x.planned ? ` of ${x.planned}` : ''} sets · {first.seconds ? `${first.seconds} s` : `${first.reps ?? '–'} reps`}{first.load ? ` · ${first.load} kg` : ''}</span></span>
                    <span className="caption" style={{ textAlign: 'right' }}>{pr?.next === 'up' ? 'Progress' : pr?.next === 'back' ? 'Step back' : pr ? 'Repeat' : ''}{nx ? <><br />Next: {nx}</> : null}</span>
                  </li>
                );
              })}
            </ul>
            <p className="caption">All sets done at an effort of 7 or less: the next session goes up a little. Harder than that, or sets missed: the same again. Two skipped sessions: a step back.</p>
          </>
        ) : <p className="muted">No strength session recorded yet. Start one from Training.</p>}
      </section>
    </div>
  );
}
