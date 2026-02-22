'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getSupabaseClient } from '../../src/lib/supabaseClient';
import {
  normalizeFreeText,
  resolveAnswerHotkeyChoicePosition,
  resolveFibInputEnterIntent,
} from '../_components/questionRunnerLogic.mjs';
import {
  SPRINT_DECK_SIZE,
  SPRINT_DURATION_SECONDS,
  applySprintAnswerOutcome,
  buildSprintDeck,
  createSprintStats,
  formatSprintAccuracyPercent,
  getSprintTimerSnapshot,
  gradeSprintAnswer,
  resolveSprintQuestionState,
  resolveSprintTimerIntent,
  startSprintTimer,
} from './sprintLogic.mjs';

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

export default function SprintPage() {
  const fibInputRef = useRef(null);
  const feedbackTimeoutRef = useRef(null);
  const [phase, setPhase] = useState('idle');
  const [deck, setDeck] = useState([]);
  const [cursor, setCursor] = useState(0);
  const [stats, setStats] = useState(() => createSprintStats());
  const [error, setError] = useState('');
  const [timer, setTimer] = useState(null);
  const [remainingSeconds, setRemainingSeconds] = useState(SPRINT_DURATION_SECONDS);
  const [userInput, setUserInput] = useState('');
  const [feedback, setFeedback] = useState(null);

  const currentQuestion = useMemo(() => {
    if (phase !== 'playing' || deck.length === 0) return null;
    return deck[cursor % deck.length] || null;
  }, [cursor, deck, phase]);

  const currentQuestionState = useMemo(
    () => resolveSprintQuestionState(currentQuestion),
    [currentQuestion]
  );
  const questionMode = currentQuestionState.questionMode;
  const visibleChoices = currentQuestionState.visibleChoices || [];
  const accuracyLabel = useMemo(() => formatSprintAccuracyPercent(stats), [stats]);

  const finishSprint = useCallback(() => {
    setPhase((prev) => (prev === 'complete' ? prev : 'complete'));
    setUserInput('');
  }, []);

  const startSprint = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setError('Supabase is not configured. Check NEXT_PUBLIC_* environment values.');
      setPhase('idle');
      return;
    }

    const nextTimer = startSprintTimer(Date.now(), SPRINT_DURATION_SECONDS);
    setTimer(nextTimer);
    setRemainingSeconds(SPRINT_DURATION_SECONDS);
    setError('');
    setPhase('loading');
    setDeck([]);
    setCursor(0);
    setStats(createSprintStats());
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
        setError(queryError.message || 'Failed to load sprint questions.');
        setPhase('idle');
        setTimer(null);
        setRemainingSeconds(SPRINT_DURATION_SECONDS);
        return;
      }

      const nextDeck = buildSprintDeck(data || [], SPRINT_DECK_SIZE);
      if (nextDeck.length === 0) {
        setError('No sprint questions available yet.');
        setPhase('idle');
        setTimer(null);
        setRemainingSeconds(SPRINT_DURATION_SECONDS);
        return;
      }

      setDeck(nextDeck);
      setPhase('playing');
    } catch (loadError) {
      const message =
        loadError instanceof Error ? loadError.message : 'Failed to load sprint questions.';
      setError(message);
      setPhase('idle');
      setTimer(null);
      setRemainingSeconds(SPRINT_DURATION_SECONDS);
    }
  }, []);

  const submitCurrentAnswer = useCallback(
    (payload = {}) => {
      if (phase !== 'playing' || !currentQuestion) return;
      if (timer && getSprintTimerSnapshot(timer).isExpired) {
        setRemainingSeconds(0);
        finishSprint();
        return;
      }

      const result = gradeSprintAnswer(currentQuestion, payload);
      if (!result.valid) return;

      setStats((prev) => applySprintAnswerOutcome(prev, result.isCorrect));
      setCursor((prev) => prev + 1);
      setUserInput('');
      setFeedback({
        id: Date.now(),
        type: result.isCorrect ? 'success' : 'error',
        message: result.isCorrect
          ? 'Correct'
          : `Incorrect. Answer: ${result.resolvedCorrectAnswerText || '--'}`,
      });
    },
    [currentQuestion, finishSprint, phase, timer]
  );

  useEffect(() => {
    if (!feedback) return;
    if (feedbackTimeoutRef.current) {
      clearTimeout(feedbackTimeoutRef.current);
    }
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
    if (phase !== 'playing' || !timer) return;

    function tick() {
      const snapshot = getSprintTimerSnapshot(timer);
      setRemainingSeconds(snapshot.remainingSeconds);
      const intent = resolveSprintTimerIntent({ phase: 'playing', timer });
      if (intent === 'finish') {
        setRemainingSeconds(0);
        finishSprint();
      }
    }

    tick();
    const intervalId = setInterval(tick, 250);
    return () => clearInterval(intervalId);
  }, [finishSprint, phase, timer]);

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

  const playingCard = phase === 'playing' && currentQuestion ? (
    <article className="runner flashcard-card" data-testid="sprint-card">
      <div className="flashcard-meta">
        <p className="muted">
          Time: {remainingSeconds}s | Answered: {stats.answered} | Correct: {stats.correct}
        </p>
        <span className="qtype-badge">{questionMode === 'fib' ? 'Fill' : 'MCQ'}</span>
      </div>
      <p className="muted">
        Streak: {stats.streak} | Best: {stats.bestStreak}
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
          <label htmlFor="sprint-fib-answer" className="muted">
            Enter your answer:
          </label>
          <input
            id="sprint-fib-answer"
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
    <section className="sprint-page">
      <div className="button-row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ marginBottom: 0 }}>Sprint</h1>
        <Link href="/today">Back to Practice</Link>
      </div>
      <p className="muted">
        60-second single-player sprint. Answer as many MCQ/FIB questions as possible. Hotkeys: 1-4
        for MCQ, Enter for Fill.
      </p>

      {error ? <p className="status error">{error}</p> : null}

      {phase === 'idle' ? (
        <section className="runner">
          <h2>Start Sprint</h2>
          <p>Loads up to {SPRINT_DECK_SIZE} questions and starts a {SPRINT_DURATION_SECONDS}s timer.</p>
          <div className="button-row">
            <button type="button" onClick={() => void startSprint()}>
              Start Sprint
            </button>
          </div>
        </section>
      ) : null}

      {phase === 'loading' ? (
        <section className="runner">
          <h2>Loading Sprint...</h2>
          <p className="muted">Timer started: {remainingSeconds}s left.</p>
        </section>
      ) : null}

      {playingCard}

      {phase === 'complete' ? (
        <section className="runner">
          <h2>Sprint Complete</h2>
          <p>Total answered: {stats.answered}</p>
          <p>Correct: {stats.correct}</p>
          <p>Accuracy: {accuracyLabel}</p>
          <p>Best streak: {stats.bestStreak}</p>
          <div className="button-row">
            <button type="button" onClick={() => void startSprint()}>
              Play again
            </button>
            <Link href="/today">Back to Practice</Link>
          </div>
        </section>
      ) : null}
    </section>
  );
}
