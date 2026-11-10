// Profile › Shoes and Profile › Body (brief §9 step 9): their own pages, opened from the Training list in Profile.
import { Navigate } from 'react-router-dom';
import { useApp } from '../app/AppContext';
import { AppHeader } from '../components/app';
import { Shoes } from '../components/Shoes';
import { BodySection } from '../components/BodySection';

export function ProfileShoes() {
  return (
    <div className="stack-lg">
      <AppHeader back title="Shoes" />
      <Shoes heading={false} />
    </div>
  );
}

export function ProfileBody() {
  const { hasFlag } = useApp();
  if (!hasFlag('body')) return <Navigate to="/profile" replace />;
  return (
    <div className="stack-lg">
      <AppHeader back title="Body" eyebrow="Niggles and exercises" />
      <BodySection heading={false} />
    </div>
  );
}
