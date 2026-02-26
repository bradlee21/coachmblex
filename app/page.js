import Link from 'next/link';

const previewQuestion = {
  prompt: 'A client reports tingling in the first three fingers after repetitive wrist flexion. Which structure is MOST likely involved?',
  choices: [
    'Ulnar nerve',
    'Median nerve',
    'Radial nerve',
    'Axillary nerve',
  ],
  correctIndex: 1,
  explanation:
    'This pattern points to median nerve compression at the carpal tunnel, a common MBLEx-style clinical presentation.',
};

const features = [
  {
    title: 'Drill Mode',
    description:
      'Target a blueprint area and question type to tighten weak spots without rebuilding a full exam.',
  },
  {
    title: 'Review Sessions',
    description:
      'Revisit missed questions with explanations so patterns stick instead of repeating the same mistakes.',
  },
  {
    title: 'Memory Match',
    description:
      'Train recall speed with a prompt-answer matching game designed around exam concepts and terminology.',
  },
  {
    title: 'Coverage Dashboard',
    description:
      'See where your study time is going and which domains still need reps before test day.',
  },
];

export default function LandingPage() {
  return (
    <main className="landing-page">
      <section className="landing-hero-grid">
        <div className="landing-surface landing-section landing-hero-copy">
          <div className="landing-kicker">
            MBLEx prep workspace
          </div>
          <h1 className="landing-title">Coach MBLEx</h1>
          <p className="landing-copy">
            A focused study app for massage therapy exam prep with daily question runs, targeted drills,
            and memory tools that feel like practice, not paperwork.
          </p>
          <div className="landing-actions">
            <Link href="/app" className="landing-btn landing-btn--primary">
              Start studying
            </Link>
            <Link href="/app" className="landing-btn landing-btn--secondary">
              Open app preview
            </Link>
          </div>
          <div className="landing-pill-grid" aria-label="Preview highlights">
            <div className="landing-pill">
              Daily study sessions
            </div>
            <div className="landing-pill">
              Question review + explanations
            </div>
            <div className="landing-pill">
              Practice modes and games
            </div>
          </div>
        </div>

        <aside className="landing-surface landing-section landing-preview">
          <div className="landing-subcard landing-preview-head">
            <div>
              <p className="landing-label">App Preview</p>
              <p className="landing-heading-sm">Today Session</p>
            </div>
            <span className="landing-progress-pill">
              Q 3 / 8
            </span>
          </div>

          <div className="landing-subcard">
            <p className="landing-label">Clinical reasoning MCQ</p>
            <p className="landing-question">{previewQuestion.prompt}</p>
            <ul className="landing-choice-list">
              {previewQuestion.choices.map((choice, index) => {
                const isCorrect = index === previewQuestion.correctIndex;
                return (
                  <li key={choice} className={`landing-choice${isCorrect ? ' is-correct' : ''}`}>
                    <span className="landing-choice-index">{String.fromCharCode(65 + index)}</span>
                    {choice}
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="landing-subcard">
            <p className="landing-label">Explanation</p>
            <p className="landing-copy landing-copy--tight">{previewQuestion.explanation}</p>
            <div className="landing-chip-row">
              <span className="landing-chip">
                Anatomy
              </span>
              <span className="landing-chip">
                Neurology
              </span>
              <span className="landing-chip">
                Review-ready
              </span>
            </div>
          </div>
        </aside>
      </section>

      <section className="landing-surface landing-section">
        <div className="landing-section-head">
          <div>
            <h2 className="landing-section-title">
              What you get inside the app
            </h2>
            <p className="landing-copy landing-copy--tight">
              Practice modes built for repetition, feedback, and better retention.
            </p>
          </div>
          <Link href="/app" className="landing-link-cta">
            Enter the app
          </Link>
        </div>
        <div className="landing-feature-grid">
          {features.map((feature) => (
            <article key={feature.title} className="landing-subcard landing-feature-card">
              <h3 className="landing-heading-sm">{feature.title}</h3>
              <p className="landing-copy landing-copy--tight">{feature.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-surface landing-section landing-cta-card">
        <h2 className="landing-section-title">
          Ready to study with the full app?
        </h2>
        <p className="landing-copy">
          Jump into the auth gate, then continue to your daily session or sign in.
        </p>
        <div className="landing-actions landing-actions--center">
          <Link href="/app" className="landing-btn landing-btn--primary">
            Start studying
          </Link>
        </div>
      </section>
    </main>
  );
}
