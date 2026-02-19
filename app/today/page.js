'use client';

import { useEffect, useState } from 'react';
import QuestionRunner from '../_components/QuestionRunner';
import { getSupabaseClient } from '../../src/lib/supabaseClient';

function shuffle(items) {
  const list = [...items];
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

function pickTodayQuestions(biasPool, allPool) {
  const preferred = shuffle(biasPool).slice(0, 6);
  const used = new Set(preferred.map((item) => item.id));
  const supplemental = shuffle(allPool).filter((item) => !used.has(item.id)).slice(0, 2);
  const merged = [...preferred, ...supplemental];

  if (merged.length < 8) {
    const fill = shuffle(allPool)
      .filter((item) => !new Set(merged.map((q) => q.id)).has(item.id))
      .slice(0, 8 - merged.length);
    return [...merged, ...fill];
  }

  return shuffle(merged);
}

export default function TodayPage() {
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function loadQuestions() {
      const supabase = getSupabaseClient();
      if (!supabase) {
        setError('Supabase is not configured. Check NEXT_PUBLIC_* environment values.');
        setLoading(false);
        return;
      }

      const selectFields =
        'id,domain,subtopic,prompt,choices,correct_index,explanation,difficulty';

      const [biasResult, allResult] = await Promise.all([
        supabase
          .from('questions')
          .select(selectFields)
          .in('domain', ['anatomy', 'kinesiology'])
          .limit(30),
        supabase.from('questions').select(selectFields).limit(80),
      ]);

      if (biasResult.error || allResult.error) {
        setError(biasResult.error?.message || allResult.error?.message || 'Failed to load questions.');
        setLoading(false);
        return;
      }

      const nextQuestions = pickTodayQuestions(biasResult.data || [], allResult.data || []);
      setQuestions(nextQuestions.slice(0, 8));
      setLoading(false);
    }

    loadQuestions();
  }, []);

  return (
    <section>
      <h1>Today</h1>
      <p>Daily run: 8 questions with extra anatomy and kinesiology coverage.</p>
      {loading ? <p>Loading questions...</p> : null}
      {error ? <p className="status error">{error}</p> : null}
      {!loading && !error ? <QuestionRunner title="Today Session" questions={questions} /> : null}
    </section>
  );
}
