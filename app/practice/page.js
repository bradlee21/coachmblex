import Link from 'next/link';
import { practiceModes } from './modes.mjs';

const ENGINE_LINKS = [
  { href: '/learn', label: 'Learning Engine', description: 'Today, flashcards, memory, anatomy.' },
  { href: '/test', label: 'Testing Engine', description: 'Testing Center and custom test setup.' },
  { href: '/coach', label: 'Coaching Engine', description: 'Study guidance and recommendations (coming soon).' },
];

export default function PracticeHubPage() {
  return (
    <section className="mx-auto w-full max-w-5xl px-4 pb-10 pt-6 sm:px-6 lg:px-8" data-testid="practice-hub">
      <header style={{ marginBottom: 16 }}>
        <h1 style={{ marginBottom: 6 }}>Practice</h1>
        <p className="muted" style={{ marginTop: 0 }}>
          Choose a mode and start practicing.
        </p>
      </header>

      <section className="runner" style={{ marginTop: 0, marginBottom: 16 }}>
        <div style={{ display: 'grid', gap: 10 }}>
          <div>
            <p style={{ margin: 0, fontWeight: 700 }}>Engines</p>
            <p className="muted" style={{ margin: '4px 0 0' }}>
              Jump to Learn, Test, or Coach from mobile or desktop.
            </p>
          </div>
          <div className="button-row">
            {ENGINE_LINKS.map((engine) => (
              <Link
                key={engine.href}
                href={engine.href}
                className="choice-btn"
                style={{ display: 'inline-block', minWidth: 150 }}
                title={engine.description}
              >
                {engine.label}
              </Link>
            ))}
          </div>
        </div>
      </section>

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
