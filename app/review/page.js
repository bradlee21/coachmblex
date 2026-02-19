'use client';

import Link from 'next/link';
import { useState } from 'react';
import QuestionRunner from '../_components/QuestionRunner';
import { getSupabaseClient } from '../../src/lib/supabaseClient';
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

async function selectReviewQuestions(supabase, userId) {
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
    return [];
  }

  const targetQuestionsResult = await supabase
    .from('questions')
    .select(
      'id,concept_id,blueprint_code,prompt,choices,correct_index,explanation,difficulty,question_type'
    )
    .in('id', targetIds)
    .eq('question_type', 'mcq');

  if (targetQuestionsResult.error) {
    throw new Error(targetQuestionsResult.error.message);
  }

  const byId = new Map((targetQuestionsResult.data || []).map((row) => [row.id, row]));
  const orderedTargets = targetIds.map((id) => byId.get(id)).filter(Boolean);
  if (orderedTargets.length === 0) {
    return [];
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

  const usedIds = new Set();
  const finalQuestions = [];
  for (const target of orderedTargets) {
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

  async function startReview() {
    const supabase = getSupabaseClient();
    if (!supabase || !user?.id) {
      setError('Unable to start review: missing auth/session.');
      return;
    }

    setError('');
    setSummary(null);
    setPhase('loading');

    const [questionsResult, profileResult] = await Promise.all([
      selectReviewQuestions(supabase, user.id),
      supabase.from('profiles').select('coach_mode').eq('id', user.id).maybeSingle(),
    ]);

    if (profileResult.data?.coach_mode) {
      setCoachMode(profileResult.data.coach_mode);
    }

    if (questionsResult.length === 0) {
      setSessionQuestions([]);
      setPhase('empty');
      return;
    }

    setSessionQuestions(questionsResult);
    setPhase('running');
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

      {phase === 'idle' ? (
        <button type="button" onClick={startReview}>
          Start Review (10)
        </button>
      ) : null}

      {phase === 'loading' ? <p>Building your review set...</p> : null}

      {phase === 'empty' ? (
        <div className="runner">
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
