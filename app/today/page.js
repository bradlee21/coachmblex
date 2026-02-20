'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import QuestionRunner from '../_components/QuestionRunner';
import { getSupabaseClient } from '../../src/lib/supabaseClient';
import { trackEvent } from '../../src/lib/trackEvent';
import { useAuth } from '../../src/providers/AuthProvider';

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
  const router = useRouter();
  const { user } = useAuth();
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [onboardingLoading, setOnboardingLoading] = useState(true);
  const [onboardingVisible, setOnboardingVisible] = useState(false);
  const [onboardingCoachMode, setOnboardingCoachMode] = useState('gentle');
  const mountedRef = useRef(true);
  const requestIdRef = useRef(0);
  const todayStartSentRef = useRef(false);

  const handleTodayComplete = useCallback(({ score, total }) => {
    void trackEvent('today_complete', {
      correct: Number(score) || 0,
      total: Number(total) || 0,
    });
  }, []);

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

  useEffect(() => {
    if (todayStartSentRef.current) return;
    if (loading || error || questions.length === 0) return;
    todayStartSentRef.current = true;
    void trackEvent('today_start');
  }, [error, loading, questions.length]);

  useEffect(() => {
    let isCancelled = false;

    async function loadOnboarding() {
      if (!user?.id) {
        if (!isCancelled) {
          setOnboardingLoading(false);
          setOnboardingVisible(false);
        }
        return;
      }

      const supabase = getSupabaseClient();
      if (!supabase) {
        if (!isCancelled) {
          setOnboardingLoading(false);
          setOnboardingVisible(false);
        }
        return;
      }

      try {
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('coach_mode,onboarding_complete')
          .eq('id', user.id)
          .maybeSingle();

        if (isCancelled) return;
        if (profileError) {
          setOnboardingVisible(false);
          return;
        }

        const nextCoachMode = profileData?.coach_mode === 'push' ? 'push' : 'gentle';
        setOnboardingCoachMode(nextCoachMode);

        if (profileData?.onboarding_complete) {
          setOnboardingVisible(false);
          return;
        }

        const { data: attemptsData } = await supabase
          .from('attempts')
          .select('id')
          .eq('user_id', user.id)
          .limit(1);
        if (isCancelled) return;

        const hasAttempts = Array.isArray(attemptsData) && attemptsData.length > 0;
        if (hasAttempts) {
          setOnboardingVisible(false);
          void supabase
            .from('profiles')
            .update({ onboarding_complete: true })
            .eq('id', user.id);
          return;
        }

        setOnboardingVisible(true);
      } finally {
        if (!isCancelled) {
          setOnboardingLoading(false);
        }
      }
    }

    setOnboardingLoading(true);
    loadOnboarding();
    return () => {
      isCancelled = true;
    };
  }, [user?.id]);

  function completeOnboarding(nextPath = '') {
    setOnboardingVisible(false);

    const supabase = getSupabaseClient();
    if (supabase && user?.id) {
      void supabase
        .from('profiles')
        .update({
          coach_mode: onboardingCoachMode,
          onboarding_complete: true,
        })
        .eq('id', user.id);
    }

    if (nextPath) {
      router.push(nextPath);
    }
  }

  return (
    <section>
      <h1>Today</h1>
      <p>Daily run: 8 questions with extra anatomy and kinesiology coverage.</p>
      {!onboardingLoading && onboardingVisible ? (
        <div className="runner" data-testid="today-onboarding">
          <h2>Quick setup</h2>
          <p className="muted">Pick your coach mode, then start studying.</p>
          <div className="settings-row">
            <span>Coach mode:</span>
            <div className="button-row">
              <button
                type="button"
                className={onboardingCoachMode === 'gentle' ? 'active-btn' : ''}
                onClick={() => setOnboardingCoachMode('gentle')}
              >
                Gentle
              </button>
              <button
                type="button"
                className={onboardingCoachMode === 'push' ? 'active-btn' : ''}
                onClick={() => setOnboardingCoachMode('push')}
              >
                Push
              </button>
            </div>
          </div>
          <div className="button-row">
            <button type="button" onClick={() => completeOnboarding()}>
              Start Today
            </button>
            <button type="button" onClick={() => completeOnboarding('/drill?code=2.D&type=mcq')}>
              Start Drill
            </button>
            <button type="button" onClick={() => completeOnboarding()}>
              Skip for now
            </button>
          </div>
        </div>
      ) : null}
      {loading ? <p>Loading questions...</p> : null}
      {error ? <p className="status error">{error}</p> : null}
      {!loading && !error ? (
        <QuestionRunner title="Today Session" questions={questions} onComplete={handleTodayComplete} />
      ) : null}
    </section>
  );
}
