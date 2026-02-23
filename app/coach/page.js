const COACHING_ITEMS = [
  {
    title: 'Study Plan',
    description: 'Personalized weekly study planning and pacing guidance.',
  },
  {
    title: 'Weak Areas',
    description: 'Identify weak topics and recommended next drills.',
  },
  {
    title: 'Reminders',
    description: 'Study reminders and habit support nudges.',
  },
];

export default function CoachEnginePage() {
  return (
    <section className="mx-auto w-full max-w-5xl px-4 pb-10 pt-6 sm:px-6 lg:px-8">
      <header style={{ marginBottom: 16 }}>
        <h1 style={{ marginBottom: 6 }}>Coaching</h1>
        <p className="muted" style={{ marginTop: 0 }}>
          Coaching engine: guidance and recommendations for what to study next.
        </p>
      </header>

      <div className="game-grid">
        {COACHING_ITEMS.map((item) => (
          <article key={item.title} className="game-card">
            <h2>{item.title}</h2>
            <p className="muted" style={{ marginTop: 0 }}>
              {item.description}
            </p>
            <div className="button-row">
              <button type="button" className="choice-btn" disabled aria-disabled="true">
                Coming soon
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
