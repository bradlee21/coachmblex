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
  BOSS_FIGHT_DECK_SIZE,
  BOSS_FIGHT_STARTING_HEARTS,
  BOSS_FIGHT_TARGET_SCORE,
  applyBossFightAnswerOutcome,
  createBossFightStats,
  resolveBossFightOutcome,
} from './bossFightLogic.mjs';

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

export default function BossFightPage() {
  const fibInputRef = useRef(null);
  const feedbackTimeoutRef = useRef(null);
  const [phase, setPhase] = useState('idle');
  const [deck, setDeck] = useState([]);
  const [cursor, setCursor] = useState(0);
  const [stats, setStats] = useState(() => createBossFightStats());
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

  const startBossFight = useCallback(async () => {
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
    setStats(createBossFightStats());
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
        setError(queryError.message || 'Failed to load boss fight questions.');
        setPhase('idle');
        return;
      }

      const nextDeck = buildSprintDeck(data || [], BOSS_FIGHT_DECK_SIZE);
      if (nextDeck.length === 0) {
        setError('No boss fight questions available yet.');
        setPhase('idle');
        return;
      }

      setDeck(nextDeck);
      setPhase('playing');
    } catch (loadError) {
      const message =
        loadError instanceof Error ? loadError.message : 'Failed to load boss fight questions.';
      setError(message);
      setPhase('idle');
    }
  }, []);

  const submitCurrentAnswer = useCallback(
    (payload = {}) => {
      if (phase !== 'playing' || !currentQuestion) return;

      const grade = gradeSprintAnswer(currentQuestion, payload);
      if (!grade.valid) return;

      const nextStats = applyBossFightAnswerOutcome(stats, grade.isCorrect);
      const nextCursor = cursor + 1;
      const remainingQuestions = Math.max(0, deck.length - nextCursor);
      const outcome = resolveBossFightOutcome({
        stats: nextStats,
        remainingQuestions,
      });

      setStats(nextStats);
      setCursor(nextCursor);
      setUserInput('');
      setFeedback({
        id: Date.now(),
        type: grade.isCorrect ? 'success' : 'error',
        message: grade.isCorrect
          ? 'Correct'
          : `Wrong. Answer: ${grade.resolvedCorrectAnswerText || '--'}`,
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

  const resultHeading =
    resultType === 'win'
      ? 'Boss Defeated'
      : resultType === 'loss'
        ? 'Boss Fight Lost'
        : 'Boss Fight Complete';
  const resultMessage =
    resultType === 'win'
      ? 'You reached 10 correct answers before running out of hearts.'
      : resultType === 'loss'
        ? 'You ran out of hearts before reaching 10 correct answers.'
        : 'The deck ran out before the fight ended.';

  const playingCard = phase === 'playing' && currentQuestion ? (
    <article className="runner flashcard-card" data-testid="boss-fight-card">
      <div className="flashcard-meta">
        <p className="muted">
          Hearts: {stats.hearts}/{BOSS_FIGHT_STARTING_HEARTS} | Score: {stats.score}/{BOSS_FIGHT_TARGET_SCORE}
        </p>
        <span className="qtype-badge">{questionMode === 'fib' ? 'Fill' : 'MCQ'}</span>
      </div>
      <p className="muted">Answered: {stats.answered}</p>
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
          <label htmlFor="boss-fight-fib-answer" className="muted">
            Enter your answer:
          </label>
          <input
            id="boss-fight-fib-answer"
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
    <section className="boss-fight-page">
      <div className="button-row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ marginBottom: 0 }}>Boss Fight</h1>
        <Link href="/today">Back to Practice</Link>
      </div>
      <p className="muted">
        Single-player challenge: 3 hearts. Reach {BOSS_FIGHT_TARGET_SCORE} correct answers before
        your hearts run out. Hotkeys: 1-4 for MCQ, Enter for Fill.
      </p>

      {error ? <p className="status error">{error}</p> : null}

      {phase === 'idle' ? (
        <section className="runner">
          <h2>Start Boss Fight</h2>
          <p>
            Loads a shuffled deck of up to {BOSS_FIGHT_DECK_SIZE} questions. Wrong answers cost a
            heart.
          </p>
          <div className="button-row">
            <button type="button" onClick={() => void startBossFight()}>
              Start Boss Fight
            </button>
          </div>
        </section>
      ) : null}

      {phase === 'loading' ? (
        <section className="runner">
          <h2>Loading Boss Fight...</h2>
          <p className="muted">Preparing a shuffled deck.</p>
        </section>
      ) : null}

      {playingCard}

      {phase === 'complete' ? (
        <section className="runner">
          <h2>{resultHeading}</h2>
          <p>{resultMessage}</p>
          <p>Score: {stats.score} / {BOSS_FIGHT_TARGET_SCORE}</p>
          <p>Hearts left: {stats.hearts}</p>
          <p>Total answered: {stats.answered}</p>
          <p>Accuracy: {stats.answered > 0 ? Math.round((stats.correct / stats.answered) * 100) : 0}%</p>
          <div className="button-row">
            <button type="button" onClick={() => void startBossFight()}>
              Play again
            </button>
            <Link href="/today">Back to Practice</Link>
          </div>
        </section>
      ) : null}
    </section>
  );
}
