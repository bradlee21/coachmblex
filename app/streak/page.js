'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getSupabaseClient } from '../../src/lib/supabaseClient';
import {
  normalizeFreeText,
  resolveAnswerHotkeyChoicePosition,
  resolveFibInputEnterIntent,
} from '../_components/questionRunnerLogic.mjs';
import { buildSprintDeck, gradeSprintAnswer, resolveSprintQuestionState } from '../sprint/sprintLogic.mjs';
import {
  STREAK_DECK_SIZE,
  STREAK_TARGET,
  applyStreakOutcome,
  createStreakStats,
  resolveStreakEnd,
} from './streakLogic.mjs';

function isTypingTarget(target) {
  if (!target) return false;
  const tagName = target.tagName?.toLowerCase();
  return (
    target.isContentEditable ||
    tagName === 'input' ||
    tagName === 'textarea' ||
    tagName === 'select'
  );
}

export default function StreakPage() {
  const fibInputRef = useRef(null);
  const feedbackTimeoutRef = useRef(null);
  const [phase, setPhase] = useState('idle');
  const [deck, setDeck] = useState([]);
  const [cursor, setCursor] = useState(0);
  const [stats, setStats] = useState(() => createStreakStats());
  const [resultType, setResultType] = useState('');
  const [error, setError] = useState('');
  const [userInput, setUserInput] = useState('');
  const [feedback, setFeedback] = useState(null);

  const currentQuestion = useMemo(() => {
    if (phase !== 'playing') return null;
    return deck[cursor] || null;
  }, [cursor, deck, phase]);

  const currentQuestionState = useMemo(
    () => resolveSprintQuestionState(currentQuestion),
    [currentQuestion]
  );
  const questionMode = currentQuestionState.questionMode;
  const visibleChoices = currentQuestionState.visibleChoices || [];

  const startStreak = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setError('Supabase is not configured. Check NEXT_PUBLIC_* environment values.');
      setPhase('idle');
      return;
    }

    setError('');
    setPhase('loading');
    setDeck([]);
    setCursor(0);
    setStats(createStreakStats());
    setResultType('');
    setUserInput('');
    setFeedback(null);

    try {
      const { data, error: queryError } = await supabase
        .from('questions')
        .select('*')
        .not('blueprint_code', 'is', null)
        .order('created_at', { ascending: false })
        .limit(200);

      if (queryError) {
        setError(queryError.message || 'Failed to load streak questions.');
        setPhase('idle');
        return;
      }

      const nextDeck = buildSprintDeck(data || [], STREAK_DECK_SIZE);
      if (nextDeck.length === 0) {
        setError('No streak questions available yet.');
        setPhase('idle');
        return;
      }

      setDeck(nextDeck);
      setPhase('playing');
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : 'Failed to load streak questions.';
      setError(message);
      setPhase('idle');
    }
  }, []);

  const submitCurrentAnswer = useCallback(
    (payload = {}) => {
      if (phase !== 'playing' || !currentQuestion) return;

      const grade = gradeSprintAnswer(currentQuestion, payload);
      if (!grade.valid) return;

      const nextStats = applyStreakOutcome(stats, { correct: grade.isCorrect });
      const nextCursor = cursor + 1;
      const remainingQuestions = Math.max(0, deck.length - nextCursor);
      const outcome = resolveStreakEnd({ stats: nextStats, remainingQuestions });

      setStats(nextStats);
      setCursor(nextCursor);
      setUserInput('');
      setFeedback({
        id: Date.now(),
        type: grade.isCorrect ? 'success' : 'error',
        message: grade.isCorrect ? 'Correct' : `Streak reset. Answer: ${grade.resolvedCorrectAnswerText || '--'}`,
      });

      if (outcome !== 'playing') {
        setResultType(outcome);
        setPhase('complete');
      }
    },
    [cursor, currentQuestion, deck.length, phase, stats]
  );

  useEffect(() => {
    if (!feedback) return;
    if (feedbackTimeoutRef.current) clearTimeout(feedbackTimeoutRef.current);
    feedbackTimeoutRef.current = setTimeout(() => {
      setFeedback(null);
      feedbackTimeoutRef.current = null;
    }, 700);
    return () => {
      if (feedbackTimeoutRef.current) {
        clearTimeout(feedbackTimeoutRef.current);
        feedbackTimeoutRef.current = null;
      }
    };
  }, [feedback]);

  useEffect(() => {
    if (phase !== 'playing' || questionMode !== 'fib') return;
    const input = fibInputRef.current;
    if (!input) return;
    try {
      input.focus({ preventScroll: true });
    } catch {
      input.focus();
    }
  }, [cursor, phase, questionMode]);

  useEffect(() => {
    function onKeyDown(event) {
      if (isTypingTarget(event.target)) return;
      if (phase !== 'playing' || !currentQuestion) return;

      const hotkeyChoicePosition = resolveAnswerHotkeyChoicePosition({
        questionMode,
        key: event.key,
        visibleChoiceCount: visibleChoices.length,
      });
      if (hotkeyChoicePosition != null) {
        event.preventDefault();
        submitCurrentAnswer({ choiceIndex: visibleChoices[hotkeyChoicePosition].rawIndex });
        return;
      }

      const fibEnterIntent = resolveFibInputEnterIntent({
        key: event.key,
        submitted: false,
      });
      if (fibEnterIntent === 'submit' && questionMode === 'fib') {
        event.preventDefault();
        submitCurrentAnswer({ inputText: userInput });
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [currentQuestion, phase, questionMode, submitCurrentAnswer, userInput, visibleChoices]);

  const resultHeading = resultType === 'won' ? 'Streak Ladder Cleared' : 'Streak Ladder Complete';
  const resultMessage =
    resultType === 'won'
      ? `You reached the target streak of ${STREAK_TARGET}.`
      : 'The deck ran out before you reached the target streak.';

  const playingCard = phase === 'playing' && currentQuestion ? (
    <article className="runner flashcard-card" data-testid="streak-card">
      <div className="flashcard-meta">
        <p className="muted">
          Progress: {stats.streak}/{STREAK_TARGET} streak | Score: {stats.score}
        </p>
        <span className="qtype-badge">{questionMode === 'fib' ? 'Fill' : 'MCQ'}</span>
      </div>
      <p style={{ fontSize: '1.8rem', fontWeight: 700, margin: '8px 0 4px' }}>
        Current Streak: {stats.streak}
      </p>
      <p className="muted">
        Target: {STREAK_TARGET} | Best streak: {stats.bestStreak} | Answered: {stats.answered}
      </p>
      {feedback ? <p className={`status ${feedback.type}`}>{feedback.message}</p> : null}
      <p className="runner-prompt">{currentQuestion.prompt}</p>

      {questionMode === 'mcq' ? (
        <div className="choice-list">
          {visibleChoices.map(({ choice, rawIndex }, choicePosition) => (
            <button
              key={`${currentQuestion.id || 'q'}-${rawIndex}-${choice}`}
              type="button"
              className="choice-btn"
              onClick={() => submitCurrentAnswer({ choiceIndex: rawIndex })}
            >
              {choicePosition + 1}. {choice}
            </button>
          ))}
        </div>
      ) : (
        <div className="choice-list">
          <label htmlFor="streak-fib-answer" className="muted">
            Enter your answer:
          </label>
          <input
            id="streak-fib-answer"
            ref={fibInputRef}
            type="text"
            className="choice-btn"
            value={userInput}
            onChange={(event) => setUserInput(event.target.value)}
            onKeyDown={(event) => {
              const fibEnterIntent = resolveFibInputEnterIntent({
                key: event.key,
                submitted: false,
              });
              if (fibEnterIntent !== 'submit') return;
              event.preventDefault();
              submitCurrentAnswer({ inputText: userInput });
            }}
          />
          <button
            type="button"
            className="choice-btn"
            onClick={() => submitCurrentAnswer({ inputText: userInput })}
            disabled={normalizeFreeText(userInput) === ''}
          >
            Submit (Enter)
          </button>
        </div>
      )}

      <p className="muted">
        Hotkeys: {questionMode === 'fib' ? 'Enter submit.' : '1-4 answer.'}
      </p>
    </article>
  ) : null;

  return (
    <section className="streak-page">
      <div className="button-row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ marginBottom: 0 }}>Streak Ladder</h1>
        <Link href="/today">Back to Practice</Link>
      </div>
      <p className="muted">
        Build a streak to {STREAK_TARGET}. Wrong answers reset your current streak to 0. Hotkeys:
        1-4 for MCQ, Enter for Fill.
      </p>

      {error ? <p className="status error">{error}</p> : null}

      {phase === 'idle' ? (
        <section className="runner">
          <h2>Start Streak Ladder</h2>
          <p>Loads a shuffled deck of up to {STREAK_DECK_SIZE} questions. Reach a streak of {STREAK_TARGET}.</p>
          <div className="button-row">
            <button type="button" onClick={() => void startStreak()}>
              Start Streak Ladder
            </button>
          </div>
        </section>
      ) : null}

      {phase === 'loading' ? (
        <section className="runner">
          <h2>Loading Streak Ladder...</h2>
          <p className="muted">Preparing a shuffled deck.</p>
        </section>
      ) : null}

      {playingCard}

      {phase === 'complete' ? (
        <section className="runner">
          <h2>{resultHeading}</h2>
          <p>{resultMessage}</p>
          <p>Final streak: {stats.streak}</p>
          <p>Best streak: {stats.bestStreak}</p>
          <p>Score: {stats.score}</p>
          <p>Total answered: {stats.answered}</p>
          <p>Accuracy: {stats.answered > 0 ? Math.round((stats.correctCount / stats.answered) * 100) : 0}%</p>
          <div className="button-row">
            <button type="button" onClick={() => void startStreak()}>
              Play again
            </button>
            <Link href="/today">Back to Practice</Link>
          </div>
        </section>
      ) : null}
    </section>
  );
}
