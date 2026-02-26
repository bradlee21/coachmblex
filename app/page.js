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
    <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
      <section className="grid gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:items-start">
        <div className="rounded-3xl border border-slate-200/80 bg-white/75 p-6 shadow-sm backdrop-blur dark:border-slate-800/80 dark:bg-slate-950/60 sm:p-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200/80 bg-white/80 px-3 py-1 text-xs font-medium text-slate-700 dark:border-slate-700/70 dark:bg-slate-900/70 dark:text-slate-300">
            MBLEx prep workspace
          </div>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-100 sm:text-4xl lg:text-5xl">
            Coach MBLEx
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-700 dark:text-slate-300 sm:text-base">
            A focused study app for massage therapy exam prep with daily question runs, targeted drills,
            and memory tools that feel like practice, not paperwork.
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/app"
              className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
            >
              Start studying
            </Link>
            <Link
              href="/app"
              className="inline-flex items-center justify-center rounded-xl border border-slate-300/80 bg-white/80 px-4 py-2.5 text-sm font-medium text-slate-800 transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-200 dark:hover:bg-slate-900"
            >
              Open app preview
            </Link>
          </div>
          <div className="mt-6 grid gap-3 text-xs text-slate-600 dark:text-slate-400 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-200/70 bg-white/70 px-3 py-2 dark:border-slate-800/80 dark:bg-slate-900/50">
              Daily study sessions
            </div>
            <div className="rounded-xl border border-slate-200/70 bg-white/70 px-3 py-2 dark:border-slate-800/80 dark:bg-slate-900/50">
              Question review + explanations
            </div>
            <div className="rounded-xl border border-slate-200/70 bg-white/70 px-3 py-2 dark:border-slate-800/80 dark:bg-slate-900/50">
              Practice modes and games
            </div>
          </div>
        </div>

        <aside className="rounded-3xl border border-slate-200/80 bg-white/80 p-4 shadow-sm backdrop-blur dark:border-slate-800/80 dark:bg-slate-950/60 sm:p-5">
          <div className="flex items-center justify-between rounded-2xl border border-slate-200/80 bg-white/80 px-4 py-3 dark:border-slate-800/80 dark:bg-slate-900/60">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                App Preview
              </p>
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Today Session</p>
            </div>
            <span className="rounded-full border border-emerald-300/70 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:border-emerald-700/60 dark:bg-emerald-900/30 dark:text-emerald-300">
              Q 3 / 8
            </span>
          </div>

          <div className="mt-4 rounded-2xl border border-slate-200/80 bg-white/80 p-4 dark:border-slate-800/80 dark:bg-slate-900/60">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Clinical reasoning MCQ
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-900 dark:text-slate-100">
              {previewQuestion.prompt}
            </p>
            <ul className="mt-4 space-y-2">
              {previewQuestion.choices.map((choice, index) => {
                const isCorrect = index === previewQuestion.correctIndex;
                return (
                  <li
                    key={choice}
                    className={`rounded-xl border px-3 py-2 text-sm ${
                      isCorrect
                        ? 'border-emerald-300/80 bg-emerald-50 text-emerald-800 dark:border-emerald-700/60 dark:bg-emerald-900/30 dark:text-emerald-200'
                        : 'border-slate-200/80 bg-white/90 text-slate-700 dark:border-slate-700/80 dark:bg-slate-950/40 dark:text-slate-300'
                    }`}
                  >
                    <span className="mr-2 text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">
                      {String.fromCharCode(65 + index)}
                    </span>
                    {choice}
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="mt-4 rounded-2xl border border-slate-200/80 bg-white/80 p-4 dark:border-slate-800/80 dark:bg-slate-900/60">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Explanation
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-700 dark:text-slate-300">
              {previewQuestion.explanation}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="rounded-full border border-slate-200/80 bg-white px-2.5 py-1 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-950/50 dark:text-slate-300">
                Anatomy
              </span>
              <span className="rounded-full border border-slate-200/80 bg-white px-2.5 py-1 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-950/50 dark:text-slate-300">
                Neurology
              </span>
              <span className="rounded-full border border-slate-200/80 bg-white px-2.5 py-1 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-950/50 dark:text-slate-300">
                Review-ready
              </span>
            </div>
          </div>
        </aside>
      </section>

      <section className="mt-8 rounded-3xl border border-slate-200/80 bg-white/70 p-6 shadow-sm backdrop-blur dark:border-slate-800/80 dark:bg-slate-950/50 sm:p-8">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100 sm:text-2xl">
              What you get inside the app
            </h2>
            <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">
              Practice modes built for repetition, feedback, and better retention.
            </p>
          </div>
          <Link
            href="/app"
            className="inline-flex items-center text-sm font-medium text-slate-900 underline decoration-slate-300 underline-offset-4 hover:decoration-slate-500 dark:text-slate-100 dark:decoration-slate-600 dark:hover:decoration-slate-300"
          >
            Enter the app
          </Link>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {features.map((feature) => (
            <article
              key={feature.title}
              className="rounded-2xl border border-slate-200/80 bg-white/80 p-4 shadow-sm dark:border-slate-800/80 dark:bg-slate-900/60"
            >
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {feature.title}
              </h3>
              <p className="mt-2 text-sm leading-6 text-slate-700 dark:text-slate-300">
                {feature.description}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-8 rounded-3xl border border-slate-200/80 bg-white/75 p-6 text-center shadow-sm backdrop-blur dark:border-slate-800/80 dark:bg-slate-950/55 sm:p-8">
        <h2 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100 sm:text-2xl">
          Ready to study with the full app?
        </h2>
        <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">
          Jump into the auth gate, then continue to your daily session or sign in.
        </p>
        <div className="mt-5">
          <Link
            href="/app"
            className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
          >
            Start studying
          </Link>
        </div>
      </section>
    </main>
  );
}
