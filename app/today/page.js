'use client';

import { useEffect, useState } from 'react';
import QuestionRunner from '../_components/QuestionRunner';
import { getSupabaseClient } from '../../src/lib/supabaseClient';

function pickTodayQuestions(biasPool, allPool) {
  const preferred = biasPool.slice(0, 6);
  const used = new Set(preferred.map((item) => item.id));
  const supplemental = allPool.filter((item) => !used.has(item.id)).slice(0, 2);
  const merged = [...preferred, ...supplemental];

  if (merged.length < 8) {
    const mergedIds = new Set(merged.map((q) => q.id));
    const fill = allPool
      .filter((item) => !mergedIds.has(item.id))
      .slice(0, 8 - merged.length);
    return [...merged, ...fill];
  }

  return merged;
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
        'id,domain,subtopic,blueprint_code,prompt,choices,correct_index,explanation,difficulty,created_at';

      const [biasResult, allResult] = await Promise.all([
        supabase
          .from('questions')
          .select(selectFields)
          .eq('question_type', 'mcq')
          .or('blueprint_code.like.1.%,blueprint_code.like.2.%')
          .order('created_at', { ascending: false })
          .limit(40),
        supabase
          .from('questions')
          .select(selectFields)
          .eq('question_type', 'mcq')
          .not('blueprint_code', 'is', null)
          .order('created_at', { ascending: false })
          .limit(80),
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
