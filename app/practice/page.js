import Link from 'next/link';
import { practiceModes } from './modes.mjs';

export default function PracticeHubPage() {
  return (
    <section className="mx-auto w-full max-w-5xl px-4 pb-10 pt-6 sm:px-6 lg:px-8" data-testid="practice-hub">
      <header style={{ marginBottom: 16 }}>
        <h1 style={{ marginBottom: 6 }}>Practice</h1>
        <p className="muted" style={{ marginTop: 0 }}>
          Choose a mode and start practicing.
        </p>
      </header>

      <div className="game-grid">
        {practiceModes.map((mode) => (
          <article
            key={mode.slug}
            className="game-card"
            data-testid={`practice-card-${mode.slug}`}
          >
            <h2>{mode.name}</h2>
            <p className="muted" style={{ marginTop: 0 }}>
              {mode.description}
            </p>
            <div className="button-row">
              <Link href={mode.href} className="choice-btn" style={{ display: 'inline-block', minWidth: 120 }}>
                Start
              </Link>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

