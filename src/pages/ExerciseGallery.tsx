// Every exercise and its drawing, side by side (update 5, U5): the page to check that each one shows the right
// movement, with its props and both arms. Open /exercise-demos.
import { AppHeader } from '../components/app';
import { ExerciseDemo } from '../components/ExerciseDemo';
import { hasOwnDemo } from '../components/figure';
import { EXERCISES } from '../training/strength';

export default function ExerciseGallery() {
  return (
    <div className="stack-lg" style={{ maxWidth: 960 }}>
      <AppHeader title="Exercise drawings" eyebrow={`${EXERCISES.length} exercises`} back />
      <ul className="demo-gallery">
        {EXERCISES.map((e) => (
          <li key={e.id} className="card demo-cell">
            <ExerciseDemo id={e.id} pattern={e.pattern} name={e.name} muscles={e.muscles} weights={e.equipment === 'light' && e.tags.includes('weights')} size={132} />
            <span className="label">{e.name}</span>
            <span className="caption">{hasOwnDemo(e.id) ? 'Its own drawing' : `Shared: ${e.pattern}`}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
