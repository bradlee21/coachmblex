'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import QuestionRunner from '../_components/QuestionRunner';
import { shuffleSessionQuestionChoices } from '../_components/questionRunnerLogic.mjs';
import { devLog } from '../../src/lib/devLog';
import { getSupabaseClient } from '../../src/lib/supabaseClient';
import {
  loadLocalReviewQueueIds,
  removeLocalReviewQueueIds,
  REVIEW_QUEUE_CHANGED_EVENT,
} from '../../src/lib/reviewQueueLocal';
import { useAuth } from '../../src/providers/AuthProvider';

function getBestStreak(results) {
  let streak = 0;
  let best = 0;
  for (const item of results) {
    if (item.correct) {
      streak += 1;
      if (streak > best) best = streak;
    } else {
      streak = 0;
    }
  }
  return best;
}

function getConfidenceDistribution(results) {
  const distribution = { sure: 0, kinda: 0, guess: 0 };
  for (const item of results) {
    if (distribution[item.confidence] !== undefined) {
      distribution[item.confidence] += 1;
    }
  }
  return distribution;
}

function getFocusCodes(results) {
  const counts = {};
  for (const item of results) {
    if (item.correct && item.confidence !== 'guess') continue;
    const code = item.blueprint_code || 'unknown';
    counts[code] = (counts[code] || 0) + 1;
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([code, count]) => ({ code, count }));
}

const REVIEW_QUESTION_FIELDS =
  'id,concept_id,blueprint_code,prompt,choices,correct_index,explanation,difficulty,question_type';
const REVIEW_SESSION_DEFAULT_COUNT = 10;

function mergeQuestionIds(...lists) {
  const seen = new Set();
  const merged = [];
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const value of list) {
      if (value === null || value === undefined) continue;
      const key = String(value).trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      merged.push(key);
    }
  }
  return merged;
}

function toQuestionIdQueryValues(questionIds) {
  return mergeQuestionIds(questionIds).map((id) =>
    /^\d+$/.test(id) ? Number.parseInt(id, 10) : id
  );
}

async function selectQuestionsByIds(supabase, questionIds, { limit = 10 } = {}) {
  const orderedIds = mergeQuestionIds(questionIds).slice(0, limit);
  if (orderedIds.length === 0) return [];
  const queryIds = toQuestionIdQueryValues(orderedIds);

  const questionsResult = await supabase
    .from('questions')
    .select(REVIEW_QUESTION_FIELDS)
    .in('id', queryIds);

  if (questionsResult.error) {
    throw new Error(questionsResult.error.message);
  }

  const byId = new Map((questionsResult.data || []).map((row) => [String(row.id), row]));
  return orderedIds.map((id) => byId.get(String(id))).filter(Boolean);
}

async function selectReviewQuestions(supabase, userId, { preferredQuestions = [] } = {}) {
  if (preferredQuestions.length >= 10) {
    return preferredQuestions;
  }

  const attemptsResult = await supabase
    .from('attempts')
    .select('question_id,correct,confidence,created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(500);

  if (attemptsResult.error) {
    throw new Error(attemptsResult.error.message);
  }

  const seenQuestionIds = new Set();
  const bucketA = [];
  const bucketB = [];
  const bucketC = [];

  for (const attempt of attemptsResult.data || []) {
    const questionId = attempt.question_id;
    if (!questionId || seenQuestionIds.has(questionId)) continue;
    seenQuestionIds.add(questionId);

    if (attempt.correct === false) {
      bucketA.push(questionId);
    } else if (attempt.correct === true && attempt.confidence === 'guess') {
      bucketB.push(questionId);
    } else if (attempt.correct === true && attempt.confidence === 'kinda') {
      bucketC.push(questionId);
    }
  }

  const targetIds = [...bucketA, ...bucketB, ...bucketC].slice(0, 10);
  if (targetIds.length === 0) {
    return preferredQuestions;
  }

  const targetQuestionsResult = await supabase
    .from('questions')
    .select(REVIEW_QUESTION_FIELDS)
    .in('id', targetIds)
    // TODO: Add reverse support in review once mixed-type runner modes are enabled.
    .eq('question_type', 'mcq');

  if (targetQuestionsResult.error) {
    throw new Error(targetQuestionsResult.error.message);
  }

  const byId = new Map((targetQuestionsResult.data || []).map((row) => [row.id, row]));
  const orderedTargets = targetIds.map((id) => byId.get(id)).filter(Boolean);
  if (orderedTargets.length === 0) {
    return preferredQuestions;
  }

  const conceptIds = Array.from(
    new Set(orderedTargets.map((item) => item.concept_id).filter(Boolean))
  );
  let alternatives = [];
  if (conceptIds.length > 0) {
    const alternativesResult = await supabase
      .from('questions')
      .select(
        'id,concept_id,blueprint_code,prompt,choices,correct_index,explanation,difficulty,question_type,created_at'
      )
      .in('concept_id', conceptIds)
      .eq('question_type', 'mcq')
      .order('created_at', { ascending: false })
      .limit(500);

    if (!alternativesResult.error) {
      alternatives = alternativesResult.data || [];
    }
  }

  const alternativesByConcept = {};
  for (const row of alternatives) {
    if (!row.concept_id) continue;
    if (!alternativesByConcept[row.concept_id]) {
      alternativesByConcept[row.concept_id] = [];
    }
    alternativesByConcept[row.concept_id].push(row);
  }

  const finalQuestions = [];
  const preferredQuestionIdsSet = new Set(preferredQuestions.map((item) => String(item.id)));
  const usedIds = new Set(preferredQuestions.map((item) => item.id));

  for (const preferred of preferredQuestions) {
    finalQuestions.push(preferred);
    if (finalQuestions.length >= 10) return finalQuestions;
  }

  for (const target of orderedTargets) {
    if (preferredQuestionIdsSet.has(String(target.id))) continue;
    let pick = target;
    if (target.concept_id && alternativesByConcept[target.concept_id]) {
      const alternative = alternativesByConcept[target.concept_id].find(
        (item) => item.id !== target.id && !usedIds.has(item.id)
      );
      if (alternative) {
        pick = alternative;
      }
    }

    if (usedIds.has(pick.id)) continue;
    usedIds.add(pick.id);
    finalQuestions.push(pick);
    if (finalQuestions.length >= 10) break;
  }

  return finalQuestions;
}

export default function ReviewPage() {
  const { user } = useAuth();
  const [sessionQuestions, setSessionQuestions] = useState([]);
  const [phase, setPhase] = useState('idle');
  const [summary, setSummary] = useState(null);
  const [coachMode, setCoachMode] = useState('gentle');
  const [error, setError] = useState('');
  const [queuedHeaderCount, setQueuedHeaderCount] = useState(0);
  const [queuedUsingCount, setQueuedUsingCount] = useState(null);

  useEffect(() => {
    function getQueuedCount() {
      const userQueueIds = user?.id ? loadLocalReviewQueueIds(user.id) : [];
      const anonQueueIds = loadLocalReviewQueueIds(null);
      return user?.id
        ? mergeQuestionIds(userQueueIds, anonQueueIds).length
        : mergeQuestionIds(anonQueueIds).length;
    }

    function refreshQueuedCount() {
      setQueuedHeaderCount(getQueuedCount());
    }

    refreshQueuedCount();
    if (typeof window === 'undefined') return;

    function handleQueueChanged() {
      refreshQueuedCount();
    }

    function handleStorage(event) {
      if (!event?.key || event.key.startsWith('coachmblex_review_queue_v1:')) {
        refreshQueuedCount();
      }
    }

    window.addEventListener(REVIEW_QUEUE_CHANGED_EVENT, handleQueueChanged);
    window.addEventListener('focus', handleQueueChanged);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener(REVIEW_QUEUE_CHANGED_EVENT, handleQueueChanged);
      window.removeEventListener('focus', handleQueueChanged);
      window.removeEventListener('storage', handleStorage);
    };
  }, [user?.id]);

  async function startReview() {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setError('Unable to start review: Supabase is not configured.');
      return;
    }

    const userQueueIds = user?.id ? loadLocalReviewQueueIds(user.id) : [];
    const anonQueueIds = loadLocalReviewQueueIds(null);
    const preferredQuestionIds = user?.id
      ? mergeQuestionIds(userQueueIds, anonQueueIds)
      : mergeQuestionIds(anonQueueIds);
    const queuedCount = preferredQuestionIds.length;
    setQueuedHeaderCount(queuedCount);
    setQueuedUsingCount(null);

    setError('');
    setSummary(null);
    setPhase('loading');
    try {
      let questionsResult = [];
      let profileResult = null;
      let queuedQuestions = [];

      if (queuedCount > 0) {
        queuedQuestions = await selectQuestionsByIds(supabase, preferredQuestionIds, {
          limit: REVIEW_SESSION_DEFAULT_COUNT,
        });
        setQueuedUsingCount(queuedQuestions.length);
        devLog(
          `[REVIEW] queue queued=${queuedCount} fetched_from_queue=${queuedQuestions.length}`
        );
        if (queuedQuestions.length === 0) {
          setSessionQuestions([]);
          setPhase('idle');
          setError(
            'Queued review items were found locally, but none could be loaded. They may be stale or unavailable. Your local review queue was not changed.'
          );
          return;
        }
      } else {
        setQueuedUsingCount(null);
        devLog('[REVIEW] queue queued=0 fetched_from_queue=0');
      }

      if (queuedQuestions.length > 0) {
        questionsResult = queuedQuestions;
        if (user?.id) {
          profileResult = await supabase
            .from('profiles')
            .select('coach_mode')
            .eq('id', user.id)
            .maybeSingle();
        }
      } else if (user?.id) {
        [questionsResult, profileResult] = await Promise.all([
          selectReviewQuestions(supabase, user.id, { preferredQuestions: queuedQuestions }),
          supabase.from('profiles').select('coach_mode').eq('id', user.id).maybeSingle(),
        ]);
      } else {
        questionsResult = queuedQuestions;
      }

      if (profileResult?.data?.coach_mode) {
        setCoachMode(profileResult.data.coach_mode);
      }

      if (questionsResult.length === 0) {
        setSessionQuestions([]);
        setPhase('empty');
        return;
      }

      if (queuedQuestions.length > 0) {
        const usedSessionQuestionIds = new Set(
          questionsResult.map((question) => String(question?.id || '')).filter(Boolean)
        );
        const fetchedFromQueueIds = new Set(
          queuedQuestions.map((question) => String(question?.id || '')).filter(Boolean)
        );
        const userQueueIdSet = new Set(userQueueIds.map((id) => String(id)));

        let consumedUserCount = 0;
        let consumedAnonCount = 0;

        if (user?.id && userQueueIds.length > 0) {
          const userIdsToConsume = userQueueIds.filter((id) => {
            const idKey = String(id);
            return fetchedFromQueueIds.has(idKey) && usedSessionQuestionIds.has(idKey);
          });
          if (userIdsToConsume.length > 0) {
            const result = removeLocalReviewQueueIds(user.id, userIdsToConsume);
            consumedUserCount = result.removedCount || 0;
          }
        }

        if (anonQueueIds.length > 0) {
          const anonIdsToConsume = anonQueueIds.filter((id) => {
            const idKey = String(id);
            if (!fetchedFromQueueIds.has(idKey)) return false;
            if (!usedSessionQuestionIds.has(idKey)) return false;
            if (user?.id && userQueueIdSet.has(idKey)) return false;
            return true;
          });
          if (anonIdsToConsume.length > 0) {
            const result = removeLocalReviewQueueIds(null, anonIdsToConsume);
            consumedAnonCount = result.removedCount || 0;
          }
        }

        if (consumedUserCount > 0 || consumedAnonCount > 0) {
          devLog(
            `[REVIEW] consumed local queue ids user=${consumedUserCount} anon=${consumedAnonCount}`
          );
        }
      }

      setSessionQuestions(questionsResult.map(shuffleSessionQuestionChoices));
      setPhase('running');
    } catch (startError) {
      setSessionQuestions([]);
      setPhase('idle');
      setError(
        startError instanceof Error && startError.message
          ? `Unable to start review: ${startError.message}`
          : 'Unable to start review.'
      );
    }
  }

  function handleComplete(result) {
    const focusCodes = getFocusCodes(result.results || []);
    const bestStreak = getBestStreak(result.results || []);
    const confidence = getConfidenceDistribution(result.results || []);
    const topCode = focusCodes[0]?.code || '2.D';
    const nextText =
      coachMode === 'push'
        ? `Do Today + one 10Q Drill on ${topCode} now.`
        : `Nice work. Hit Today next, then one Drill on ${topCode}.`;

    setSummary({
      score: result.score,
      total: result.total,
      bestStreak,
      confidence,
      focusCodes,
      nextText,
    });
    setPhase('done');
  }

  return (
    <section>
      <h1>Review</h1>
      <p>Global review queue from misses and low-confidence answers.</p>
      <p className="muted">
        Queued: {queuedHeaderCount}
        {typeof queuedUsingCount === 'number' && queuedUsingCount > 0
          ? ` | Using: ${queuedUsingCount}`
          : ''}
      </p>

      {phase === 'idle' ? (
        <button type="button" onClick={startReview} data-testid="review-start">
          Start Review (
          {queuedHeaderCount > 0
            ? Math.min(queuedHeaderCount, REVIEW_SESSION_DEFAULT_COUNT)
            : REVIEW_SESSION_DEFAULT_COUNT}
          )
        </button>
      ) : null}

      {phase === 'loading' ? <p>Building your review set...</p> : null}

      {phase === 'empty' ? (
        <div className="runner" data-testid="review-empty">
          <p>No review items yet. Do Today or Drill first.</p>
          <div className="button-row">
            <Link className="nav-link active" href="/today">
              Go to Today
            </Link>
            <Link className="nav-link" href="/drill">
              Go to Drill
            </Link>
          </div>
        </div>
      ) : null}

      {phase === 'running' ? (
        <QuestionRunner
          title="Review Session"
          questions={sessionQuestions}
          onComplete={handleComplete}
        />
      ) : null}

      {phase === 'done' && summary ? (
        <div className="runner">
          <h2>Review Summary</h2>
          <p>
            Win: {summary.score}/{summary.total} correct, best streak {summary.bestStreak}
          </p>
          <p>
            Confidence: sure {summary.confidence.sure}, kinda {summary.confidence.kinda},
            guess {summary.confidence.guess}
          </p>
          <h3>Focus</h3>
          {summary.focusCodes.length > 0 ? (
            <ul>
              {summary.focusCodes.map((item) => (
                <li key={item.code}>
                  {item.code} ({item.count})
                </li>
              ))}
            </ul>
          ) : (
            <p>No focus gaps from this session.</p>
          )}
          <h3>Next</h3>
          <p>{summary.nextText}</p>
          <button type="button" onClick={startReview}>
            Start Another Review
          </button>
        </div>
      ) : null}

      {error ? <p className="status error">{error}</p> : null}
    </section>
  );
}
