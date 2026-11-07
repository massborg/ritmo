import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FileUp, Upload } from 'lucide-react';
import { useApp } from '../app/AppContext';
import { SKIP_LABEL, type SkipCategory } from '../data/parsers';
import { AppHeader } from '../components/app';
import { StatusLine } from '../components/ui';
import { SOURCES } from '../data/integration';
import { healthKind } from '../data/health';
import { relTime } from '../lib/format';

export function UploadPanel({ onDone }: { onDone?: () => void }) {
  const { importFiles, importState } = useApp();
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const go = async (files: FileList | null) => {
    if (!files?.length) return;
    await importFiles(Array.from(files));
    onDone?.();
  };
  const pct = importState.total ? Math.round((importState.done / importState.total) * 100) : 0;
  return (
    <div className="stack">
      <div
        className={`dropzone${drag ? ' drag' : ''}`}
        role="button" tabIndex={0} aria-label="Choose files to upload"
        onClick={() => input.current?.click()}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && input.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); go(e.dataTransfer.files); }}
      >
        <div className="stack-sm" style={{ alignItems: 'center' }}>
          <FileUp size={32} strokeWidth={2} aria-hidden="true" />
          <p className="label">Drop files here, or choose files</p>
          <p className="caption">FIT, GPX, TCX, or a ZIP such as your Garmin export. Files are read on your device.</p>
        </div>
        <input ref={input} type="file" multiple accept=".fit,.gpx,.tcx,.zip,.json" hidden onChange={(e) => go(e.target.files)} />
      </div>
      {importState.running && (
        <div className="stack-sm" aria-live="polite">
          <div className="row-between"><span className="label">Importing {importState.done} of {importState.total}</span><span className="stat">{pct}%</span></div>
          <div className="progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Import progress"><span style={{ width: `${pct}%` }} /></div>
          <p className="caption">{importState.label}</p>
        </div>
      )}
      {importState.result && !importState.running && (
        <div className="stack-sm" aria-live="polite">
          <ImportReport result={importState.result} />
        </div>
      )}
      {importState.error && <StatusLine kind="danger">Import failed: {importState.error}. Try again, or upload fewer files at once.</StatusLine>}
    </div>
  );
}

export function GarminExportSteps() {
  return (
    <ol className="ol-steps">
      <li>On a computer, sign in at <strong>garmin.com</strong> and open <strong>Account settings</strong>, then <strong>Data management</strong>.</li>
      <li>Choose <strong>Export your data</strong> and confirm. Garmin emails you a download link, usually within 48 hours.</li>
      <li>Download the ZIP file from the email. You do not need to unzip it.</li>
      <li>Upload the ZIP here. Ritmo finds every run inside, including years of history.</li>
    </ol>
  );
}

export default function DataSources() {
  const nav = useNavigate();
  const { data, loadSample, disconnectSource, startFresh } = useApp();
  const status = (k: string) => data.sources.find((s) => s.kind === k);
  return (
    <div className="stack-lg">
      <AppHeader title="Data sources" back />

      {data.mode === 'sample' && (
        <div className="banner" role="note"><p>You are viewing <strong>sample data</strong>. Uploading your own runs replaces it.</p></div>
      )}

      <section className="card stack" aria-labelledby="upload">
        <div className="row" style={{ gap: 8 }}><Upload size={20} strokeWidth={2} aria-hidden="true" /><h2 id="upload" className="title">Upload files</h2></div>
        <UploadPanel />
        <div className="grid-2">
          <div className="well stack-sm">
            <h3 className="label">Your full Garmin history</h3>
            <GarminExportSteps />
          </div>
          <div className="well stack-sm">
            <h3 className="label">Single runs</h3>
            <ol className="ol-steps">
              <li>In Garmin Connect on the web, open a run.</li>
              <li>Choose the cog icon, then <strong>Export original</strong> (FIT) or <strong>Export to TCX/GPX</strong>.</li>
              <li>Upload the file here. Strava and COROS exports in FIT, GPX or TCX work too.</li>
            </ol>
            <p className="caption">If a run arrives twice, Ritmo keeps the most detailed version.</p>
          </div>
        </div>
      </section>

      <section className="card stack" aria-labelledby="connected">
        <h2 id="connected" className="title">Connections</h2>
        <ul className="list">
          {data.mode === 'sample' && (
            <li className="list-item row-between wrap">
              <span className="stack-sm" style={{ gap: 0 }}><span className="label">Sample data</span><span className="caption">An example runner with six years of training</span></span>
              <StatusLine kind="info">In use</StatusLine>
            </li>
          )}
          {SOURCES.map((s) => {
            const st = status(s.kind);
            return (
              <li key={s.kind} className="list-item row-between wrap" style={{ alignItems: 'flex-start' }}>
                <span className="stack-sm" style={{ gap: 2, flex: 1, minWidth: 200 }}>
                  <span className="label">{s.label}</span>
                  <span className="caption">{s.description}</span>
                  {st?.lastSyncAt && <span className="caption">Last import {relTime(st.lastSyncAt)} · {st.activityCount} runs</span>}
                  {st?.lastError && <StatusLine kind="warning">{st.lastError}</StatusLine>}
                </span>
                {s.kind === 'upload' ? (st?.connected ? <StatusLine kind="success">Active</StatusLine> : <span className="caption">Ready</span>)
                  : s.availability === 'stage-2' ? <span className="tag">Coming soon</span>
                  : s.availability === 'stage-3' ? (s.kind === healthKind() ? <Link to="/profile/health" className="btn btn-small btn-primary">{st?.connected ? 'Manage' : `Connect ${s.label}`}</Link> : <Link to="/profile/health" className="tag">In the phone app</Link>)
                  : <span className="tag">Planned</span>}
                {st?.connected && s.kind !== 'upload' && s.availability !== 'stage-3' && <button className="btn btn-small" onClick={() => disconnectSource(s.kind)}>Disconnect</button>}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="card stack">
        <h2 className="title">Start over</h2>
        <div className="row wrap">
          <button className="btn" onClick={() => { loadSample(); nav('/'); }}>Explore sample data</button>
          {data.mode === 'sample' && <button className="btn" onClick={() => { startFresh(); nav('/setup'); }}>Start with my own data</button>}
          <Link to="/profile/privacy" className="btn btn-ghost">Privacy and deletion</Link>
        </div>
      </section>
    </div>
  );
}

type ImportResult = NonNullable<ReturnType<typeof useApp>['importState']['result']>;

/** What happened to every file: runs found, saved, merged and failed, and why the rest were skipped. */
function ImportReport({ result: r }: { result: ImportResult }) {
  const fmt = (n: number) => n.toLocaleString('en-GB');
  const byCat = new Map<SkipCategory, number>();
  for (const x of r.skipped) byCat.set(x.category, (byCat.get(x.category) ?? 0) + 1);
  const order: SkipCategory[] = ['wellness', 'cycling', 'swimming', 'walking', 'gym', 'other-sport', 'unsupported', 'unreadable'];
  const parts = order.filter((c) => byCat.get(c)).map((c) => `${fmt(byCat.get(c)!)} ${SKIP_LABEL[c]}`);
  const unreadable = byCat.get('unreadable') ?? 0;
  const download = () => {
    const lines = [
      `Ritmo import log, ${new Date().toISOString()}`,
      `Runs found: ${r.found}`, `New runs saved: ${r.added}`, `Runs upgraded with more detail: ${r.replaced}`, `Duplicates merged: ${r.duplicates}`,
      `Files skipped: ${r.skipped.length}`, ...order.filter((c) => byCat.get(c)).map((c) => `  ${SKIP_LABEL[c]}: ${byCat.get(c)}`), '',
      'Skipped files:', ...r.skipped.map((x) => `${x.category}\t${x.file}\t${x.reason}`),
    ];
    const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/plain' }));
    const link = document.createElement('a');
    link.href = url; link.download = `ritmo-import-log-${new Date().toISOString().slice(0, 10)}.txt`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <div className="card stack-sm">
      <StatusLine kind={unreadable ? 'warning' : 'success'}>Imported {fmt(r.added)} new run{r.added === 1 ? '' : 's'}{r.replaced ? `, upgraded ${fmt(r.replaced)} with more detail` : ''}.</StatusLine>
      <dl className="report-grid">
        <div><dt className="caption">Runs found</dt><dd className="stat">{fmt(r.found)}</dd></div>
        <div><dt className="caption">Saved as new</dt><dd className="stat">{fmt(r.added)}</dd></div>
        <div><dt className="caption">Duplicates merged</dt><dd className="stat">{fmt(r.duplicates + r.replaced)}</dd></div>
        <div><dt className="caption">Could not be read</dt><dd className="stat">{fmt(unreadable)}</dd></div>
      </dl>
      {r.skipped.length > 0 && <p className="caption">Skipped {fmt(r.skipped.length)} files that are not runs: {parts.join(', ')}. A Garmin export holds a lot of other data, so this is expected. Treadmill, track, trail, indoor and virtual runs are all imported.</p>}
      {unreadable > 0 && <p className="caption">{fmt(unreadable)} file{unreadable === 1 ? '' : 's'} could not be read. The download below lists them; if one is a run you need, try exporting it again from your watch app.</p>}
      <button className="btn btn-small" style={{ alignSelf: 'flex-start' }} onClick={download}>Download import log</button>
    </div>
  );
}
