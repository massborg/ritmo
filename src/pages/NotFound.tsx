import { Link, useLocation } from 'react-router-dom';
import { MapPinOff } from 'lucide-react';

export default function NotFound() {
  const { pathname } = useLocation();
  return (
    <div className="stack-lg" style={{ paddingTop: 'var(--s7)' }}>
      <MapPinOff size={40} strokeWidth={2} aria-hidden="true" />
      <div className="stack-sm">
        <h1 className="display-lg">Page not found</h1>
        <p className="muted">There is nothing at <span className="stat">{pathname}</span>. The link may be old or mistyped.</p>
      </div>
      <div className="row wrap">
        <Link to="/" className="btn btn-primary">Go to Today</Link>
        <Link to="/calendar" className="btn">Open Calendar</Link>
      </div>
    </div>
  );
}
