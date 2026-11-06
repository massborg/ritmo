// Catches a page that failed to load (for example after a new version was deployed) and offers a reload.
import { Component, type ReactNode } from 'react';
import { RefreshCw } from 'lucide-react';
import { isChunkError } from '../lib/chunks';

export class ChunkBoundary extends Component<{ children: ReactNode; resetKey?: string }, { error?: unknown }> {
  state: { error?: unknown } = {};
  static getDerivedStateFromError(error: unknown) { return { error }; }
  componentDidUpdate(prev: { resetKey?: string }) { if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: undefined }); }
  render() {
    if (!this.state.error) return this.props.children;
    const updated = isChunkError(this.state.error);
    return (
      <div className="card stack" role="alert" style={{ marginTop: 24 }}>
        <h1 className="title">{updated ? 'Ritmo was updated' : 'Something went wrong'}</h1>
        <p>{updated ? 'A new version is ready. Reload to keep going; nothing you saved is lost.' : 'This page could not be shown. Reload to try again; nothing you saved is lost.'}</p>
        <button className="btn btn-primary" style={{ alignSelf: 'flex-start' }} onClick={() => window.location.reload()}><RefreshCw size={18} strokeWidth={2} aria-hidden="true" />Reload</button>
      </div>
    );
  }
}
