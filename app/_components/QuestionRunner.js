'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
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

export default function QuestionRunner({ title, questions, onComplete }) {
  const { user } = useAuth();
  const [index, setIndex] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [confidence, setConfidence] = useState('kinda');
  const [submitted, setSubmitted] = useState(false);
  const [score, setScore] = useState(0);
  const [results, setResults] = useState([]);
  const [status, setStatus] = useState('');
  const [completionSent, setCompletionSent] = useState(false);

  useEffect(() => {
    setIndex(0);
    setSelectedIndex(null);
    setConfidence('kinda');
    setSubmitted(false);
    setScore(0);
    setResults([]);
    setStatus('');
    setCompletionSent(false);
  }, [questions]);

  const current = useMemo(() => questions[index], [index, questions]);
  const isDone = index >= questions.length;

  const submitAnswer = useCallback(
    async (choiceIndex) => {
      if (!current || submitted) return;

      setSelectedIndex(choiceIndex);
      setSubmitted(true);

      const isCorrect = choiceIndex === current.correct_index;
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
        setStatus('Attempt not saved: missing auth/session.');
        return;
      }

      const { error } = await supabase.from('attempts').insert({
        user_id: user.id,
        question_id: current.id,
        correct: isCorrect,
        confidence,
      });

      if (error) {
        setStatus(`Attempt save failed: ${error.message}`);
      } else {
        setStatus('');
      }
    },
    [confidence, current, submitted, user?.id]
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
        if (nextChoice < current.choices.length) {
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
    setCompletionSent(true);
  }, [completionSent, isDone, onComplete, questions.length, results, score]);

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
        {current.choices.map((choice, choiceIndex) => {
          const isSelected = selectedIndex === choiceIndex;
          const isCorrect = submitted && choiceIndex === current.correct_index;
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
          <p>Answer: {current.explanation?.answer || ''}</p>
          <p>Why: {current.explanation?.why || ''}</p>
          <p>Trap: {current.explanation?.trap || ''}</p>
          <p>Hook: {current.explanation?.hook || ''}</p>
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
