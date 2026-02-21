'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getSupabaseClient } from '../../src/lib/supabaseClient';
import { useAuth } from '../../src/providers/AuthProvider';

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

function toText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeText(value) {
  return toText(value).toLowerCase().replace(/\s+/g, ' ');
}

function toIndexFromLetter(value) {
  const letter = toText(value).toUpperCase();
  if (letter.length !== 1) return null;
  if (letter < 'A' || letter > 'Z') return null;
  return letter.charCodeAt(0) - 65;
}

function toIndexFromNumber(value, choiceCount) {
  if (typeof value === 'number' && Number.isInteger(value)) {
    if (value >= 0 && value < choiceCount) return value;
    if (value >= 1 && value <= choiceCount) return value - 1;
  }
  const asText = toText(value);
  if (!/^-?\d+$/.test(asText)) return null;
  const parsed = Number(asText);
  if (!Number.isInteger(parsed)) return null;
  if (parsed >= 0 && parsed < choiceCount) return parsed;
  if (parsed >= 1 && parsed <= choiceCount) return parsed - 1;
  return null;
}

function resolveCorrectChoiceIndex(question) {
  const choices = Array.isArray(question?.choices) ? question.choices : [];
  if (choices.length === 0) return null;

  const explicitChoiceKeys = [
    question?.correct_choice,
    question?.answer_key,
    question?.correct_option,
  ];
  for (const key of explicitChoiceKeys) {
    const byLetter = toIndexFromLetter(key);
    if (byLetter != null && byLetter >= 0 && byLetter < choices.length) {
      return byLetter;
    }
    const byNumber = toIndexFromNumber(key, choices.length);
    if (byNumber != null) return byNumber;
  }

  const explicitIndices = [question?.correct_index, question?.correctIndex];
  for (const value of explicitIndices) {
    const parsed = toIndexFromNumber(value, choices.length);
    if (parsed != null) return parsed;
  }

  const fallbackTexts = [
    question?.correct_text,
    question?.correct_answer,
    question?.answer,
    question?.explanation?.answer,
    question?.explanation_answer,
  ]
    .map((value) => normalizeText(value))
    .filter(Boolean);

  if (fallbackTexts.length === 0) return null;
  for (let i = 0; i < choices.length; i += 1) {
    const normalizedChoice = normalizeText(choices[i]);
    if (fallbackTexts.some((candidate) => candidate === normalizedChoice)) {
      return i;
    }
  }
  return null;
}

function resolveExplanationDetails(question, resolvedCorrectChoiceText) {
  const explanation =
    question?.explanation && typeof question.explanation === 'object'
      ? question.explanation
      : null;
  const explanationString = toText(question?.explanation);

  const answer =
    toText(resolvedCorrectChoiceText) ||
    toText(explanation?.answer) ||
    toText(question?.answer) ||
    toText(question?.explanation_answer) ||
    toText(question?.correct_text);
  const why =
    toText(explanation?.why) ||
    toText(question?.why) ||
    toText(question?.explanation_why) ||
    explanationString;
  const trap =
    toText(explanation?.trap) || toText(question?.trap) || toText(question?.explanation_trap);
  const hook =
    toText(explanation?.hook) || toText(question?.hook) || toText(question?.explanation_hook);

  return {
    answer: answer || '--',
    why: why || '--',
    trap: trap || '--',
    hook: hook || '--',
  };
}

export default function QuestionRunner({ title, questions, onComplete }) {
  const { user } = useAuth();
  const mountedRef = useRef(true);
  const [index, setIndex] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [confidence, setConfidence] = useState('kinda');
  const [submitted, setSubmitted] = useState(false);
  const [score, setScore] = useState(0);
  const [results, setResults] = useState([]);
  const [status, setStatus] = useState('');
  const [completionSent, setCompletionSent] = useState(false);

  useEffect(() => {
    mountedRef.current = true;
    setIndex(0);
    setSelectedIndex(null);
    setConfidence('kinda');
    setSubmitted(false);
    setScore(0);
    setResults([]);
    setStatus('');
    setCompletionSent(false);
    return () => {
      mountedRef.current = false;
    };
  }, [questions]);

  const current = useMemo(() => questions[index], [index, questions]);
  const resolvedCorrectIndex = useMemo(
    () => resolveCorrectChoiceIndex(current),
    [current]
  );
  const resolvedCorrectChoiceText = useMemo(() => {
    if (!current || !Array.isArray(current.choices)) return '';
    if (typeof resolvedCorrectIndex !== 'number' || resolvedCorrectIndex < 0) return '';
    return toText(current.choices[resolvedCorrectIndex]);
  }, [current, resolvedCorrectIndex]);
  const explanationDetails = useMemo(
    () => resolveExplanationDetails(current, resolvedCorrectChoiceText),
    [current, resolvedCorrectChoiceText]
  );
  const isDone = index >= questions.length;

  const submitAnswer = useCallback(
    async (choiceIndex) => {
      if (!current || submitted) return;

      setSelectedIndex(choiceIndex);
      setSubmitted(true);

      const isCorrect =
        typeof resolvedCorrectIndex === 'number' && choiceIndex === resolvedCorrectIndex;
      if (isCorrect) setScore((prev) => prev + 1);
      setResults((prev) => [
        ...prev,
        {
          question_id: current.id,
          blueprint_code: current.blueprint_code || '',
          correct: isCorrect,
          confidence,
        },
      ]);

      const supabase = getSupabaseClient();
      if (!supabase || !user?.id) {
        if (mountedRef.current) {
          setStatus('Attempt not saved: missing auth/session.');
        }
        console.debug(`[SESSION] runner persist skipped title=${title} reason=missing-session`);
        return;
      }

      console.debug(`[SESSION] runner persist start title=${title} q=${current.id}`);
      const { error } = await supabase.from('attempts').insert({
        user_id: user.id,
        question_id: current.id,
        correct: isCorrect,
        confidence,
      });

      if (!mountedRef.current) return;

      if (error) {
        setStatus(`Attempt save failed: ${error.message}`);
        console.debug(`[SESSION] runner persist error title=${title} q=${current.id} ${error.message}`);
      } else {
        setStatus('');
        console.debug(`[SESSION] runner persist success title=${title} q=${current.id}`);
      }
    },
    [confidence, current, resolvedCorrectIndex, submitted, title, user?.id]
  );

  const goNext = useCallback(() => {
    if (!submitted) return;
    setIndex((prev) => prev + 1);
    setSelectedIndex(null);
    setConfidence('kinda');
    setSubmitted(false);
  }, [submitted]);

  useEffect(() => {
    function onKeyDown(event) {
      if (isTypingTarget(event.target)) return;
      if (isDone || !current) return;

      const key = event.key.toLowerCase();

      if (['1', '2', '3', '4'].includes(key)) {
        event.preventDefault();
        const nextChoice = Number(key) - 1;
        if (Array.isArray(current.choices) && nextChoice < current.choices.length) {
          submitAnswer(nextChoice);
        }
        return;
      }

      if (key === 's' || key === 'k' || key === 'g') {
        event.preventDefault();
        setConfidence(key === 's' ? 'sure' : key === 'k' ? 'kinda' : 'guess');
        return;
      }

      if (key === 'enter') {
        event.preventDefault();
        goNext();
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [current, goNext, isDone, submitAnswer]);

  useEffect(() => {
    if (!isDone || completionSent) return;
    if (typeof onComplete !== 'function') return;
    onComplete({
      score,
      total: questions.length,
      results,
    });
    console.debug(
      `[SESSION] runner complete title=${title} score=${score}/${questions.length}`
    );
    setCompletionSent(true);
  }, [completionSent, isDone, onComplete, questions.length, results, score, title]);

  if (questions.length === 0) {
    return <p>No questions available yet.</p>;
  }

  if (isDone) {
    return (
      <section className="runner">
        <h2>{title} Complete</h2>
        <p>
          Score: {score} / {questions.length}
        </p>
      </section>
    );
  }

  return (
    <section className="runner">
      <h2>{title}</h2>
      <p>
        Question {index + 1} of {questions.length}
      </p>
      <p>
        <span className="qtype-badge">
          {current.question_type === 'reverse' ? 'Reverse' : 'MCQ'}
        </span>
      </p>
      <p className="runner-prompt">{current.prompt}</p>

      <div className="choice-list">
        {(Array.isArray(current.choices) ? current.choices : []).map((choice, choiceIndex) => {
          const isSelected = selectedIndex === choiceIndex;
          const isCorrect =
            submitted &&
            typeof resolvedCorrectIndex === 'number' &&
            choiceIndex === resolvedCorrectIndex;
          const isWrongSelected = submitted && isSelected && !isCorrect;
          return (
            <button
              key={choice}
              type="button"
              className={`choice-btn${isSelected ? ' selected' : ''}${isCorrect ? ' correct' : ''}${
                isWrongSelected ? ' wrong' : ''
              }`}
              onClick={() => submitAnswer(choiceIndex)}
              disabled={submitted}
            >
              {choiceIndex + 1}. {choice}
            </button>
          );
        })}
      </div>

      <div className="confidence-row">
        <span>Confidence:</span>
        <button
          type="button"
          className={confidence === 'sure' ? 'active-btn' : ''}
          onClick={() => setConfidence('sure')}
          disabled={submitted}
        >
          Sure (S)
        </button>
        <button
          type="button"
          className={confidence === 'kinda' ? 'active-btn' : ''}
          onClick={() => setConfidence('kinda')}
          disabled={submitted}
        >
          Kinda (K)
        </button>
        <button
          type="button"
          className={confidence === 'guess' ? 'active-btn' : ''}
          onClick={() => setConfidence('guess')}
          disabled={submitted}
        >
          Guess (G)
        </button>
      </div>

      {submitted ? (
        <div className="explanation-box">
          <p>Answer: {explanationDetails.answer}</p>
          <p>Why: {explanationDetails.why}</p>
          <p>Trap: {explanationDetails.trap}</p>
          <p>Hook: {explanationDetails.hook}</p>
        </div>
      ) : null}

      <button type="button" onClick={goNext} disabled={!submitted}>
        Next (Enter)
      </button>
      <p className="muted">Hotkeys: 1-4 answer, S/K/G confidence, Enter next.</p>
      {status ? <p className="status error">{status}</p> : null}
    </section>
  );
}
