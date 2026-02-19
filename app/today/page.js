'use client';

import { useEffect, useRef, useState } from 'react';
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
  const mountedRef = useRef(true);
  const requestIdRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;

    function setLoadingSafe(value, reason) {
      if (!mountedRef.current) return;
      console.debug(`[SESSION] today loading=${value} (${reason})`);
      setLoading(value);
    }

    function setErrorSafe(message) {
      if (!mountedRef.current) return;
      setError(message || '');
    }

    async function loadQuestions() {
      const requestId = ++requestIdRef.current;
      setLoadingSafe(true, 'start');
      const supabase = getSupabaseClient();
      if (!supabase) {
        setErrorSafe('Supabase is not configured. Check NEXT_PUBLIC_* environment values.');
        setLoadingSafe(false, 'no-client');
        return;
      }

      const selectFields =
        'id,domain,subtopic,blueprint_code,prompt,choices,correct_index,explanation,difficulty,created_at';

      console.debug('[SESSION] today query start');
      try {
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

        if (requestId !== requestIdRef.current || !mountedRef.current) return;

        if (biasResult.error || allResult.error) {
          setErrorSafe(
            biasResult.error?.message || allResult.error?.message || 'Failed to load questions.'
          );
          return;
        }

        const nextQuestions = pickTodayQuestions(biasResult.data || [], allResult.data || []);
        setQuestions(nextQuestions.slice(0, 8));
        setErrorSafe('');
        console.debug(`[SESSION] today query success count=${nextQuestions.slice(0, 8).length}`);
      } catch (loadError) {
        if (requestId !== requestIdRef.current || !mountedRef.current) return;
        const message =
          loadError instanceof Error ? loadError.message : 'Failed to load questions.';
        setErrorSafe(message);
        console.debug(`[SESSION] today query error=${message}`);
      } finally {
        if (requestId === requestIdRef.current) {
          setLoadingSafe(false, 'finally');
        }
      }
    }

    loadQuestions();
    return () => {
      mountedRef.current = false;
    };
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
