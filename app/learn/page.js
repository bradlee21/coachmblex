import Link from 'next/link';

const LEARNING_LINKS = [
  {
    title: 'Today',
    description: 'Daily mixed learning session with a short focused set.',
    href: '/today',
    cta: 'Open Today',
  },
  {
    title: 'Flashcards',
    description: 'Prompt/answer practice with quick ratings and explanations.',
    href: '/flashcards',
    cta: 'Open Flashcards',
  },
  {
    title: 'Memory Match',
    description: 'Match prompts to answers for retrieval practice.',
    href: '/memory',
    cta: 'Open Memory Match',
  },
  {
    title: 'Anatomy',
    description: 'Explore anatomy topics and visual learning pages.',
    href: '/anatomy',
    cta: 'Open Anatomy',
  },
];

export default function LearnEnginePage() {
  return (
    <section className="mx-auto w-full max-w-5xl px-4 pb-10 pt-6 sm:px-6 lg:px-8">
      <header style={{ marginBottom: 16 }}>
        <h1 style={{ marginBottom: 6 }}>Learning</h1>
        <p className="muted" style={{ marginTop: 0 }}>
          Learning engine: use active recall tools to build retention.
        </p>
      </header>

      <div className="game-grid">
        {LEARNING_LINKS.map((item) => (
          <article key={item.href} className="game-card">
            <h2>{item.title}</h2>
            <p className="muted" style={{ marginTop: 0 }}>
              {item.description}
            </p>
            <div className="button-row">
              <Link href={item.href} className="choice-btn" style={{ display: 'inline-block', minWidth: 140 }}>
                {item.cta}
              </Link>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
