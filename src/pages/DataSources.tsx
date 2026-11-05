import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, FileUp, Upload } from 'lucide-react';
import { useApp } from '../app/AppContext';
import { StatusLine } from '../components/ui';
import { SOURCES } from '../data/integration';
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
          <StatusLine kind="success">Imported {importState.result.added} new runs{importState.result.replaced ? `, upgraded ${importState.result.replaced} with more detail` : ''}{importState.result.duplicates ? `, skipped ${importState.result.duplicates} duplicates` : ''}.</StatusLine>
          {importState.result.skipped.length > 0 && (
            <details><summary className="label" style={{ cursor: 'pointer', minHeight: 44, display: 'flex', alignItems: 'center' }}>{importState.result.skipped.length} files not imported</summary>
              <ul className="bullets caption">{importState.result.skipped.slice(0, 50).map((s) => <li key={s.file}>{s.file.split('/').pop()}: {s.reason}</li>)}</ul>
            </details>
          )}
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
      <button className="btn btn-ghost btn-small" style={{ alignSelf: 'flex-start' }} onClick={() => nav(-1)}><ArrowLeft size={18} strokeWidth={2} aria-hidden="true" />Back</button>
      <h1 className="display-lg">Data sources</h1>

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
                  : s.availability === 'stage-3' ? <span className="tag">In the phone app</span>
                  : <span className="tag">Planned</span>}
                {st?.connected && s.kind !== 'upload' && <button className="btn btn-small" onClick={() => disconnectSource(s.kind)}>Disconnect</button>}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="card stack">
        <h2 className="title">Start over</h2>
        <div className="row wrap">
          <button className="btn" onClick={() => { loadSample(); nav('/'); }}>Explore sample data</button>
          {data.mode === 'sample' && <button className="btn" onClick={() => { startFresh(); nav('/welcome'); }}>Start with my own data</button>}
          <Link to="/profile/privacy" className="btn btn-ghost">Privacy and deletion</Link>
        </div>
      </section>
    </div>
  );
}
