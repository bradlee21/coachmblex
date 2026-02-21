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

function normalizeFreeText(value) {
  return normalizeText(value).replace(/[.,!?;:]+$/g, '');
}

function toIndexFromLetter(value) {
  const letter = toText(value).toUpperCase();
  if (letter.length !== 1) return null;
  if (letter < 'A' || letter > 'Z') return null;
  return letter.charCodeAt(0) - 65;
}

function getChoiceList(question) {
  if (Array.isArray(question?.choices)) return question.choices;
  if (question?.choices && typeof question.choices === 'object') {
    return ['A', 'B', 'C', 'D']
      .map((key) => question.choices[key])
      .filter((value) => value != null);
  }
  return [];
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
  const choices = getChoiceList(question);
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

function resolveCorrectAnswerText(question, resolvedCorrectChoiceText) {
  return (
    toText(resolvedCorrectChoiceText) ||
    toText(question?.correct_text) ||
    toText(question?.correct_answer) ||
    toText(question?.answer) ||
    toText(question?.explanation?.answer) ||
    toText(question?.explanation_answer)
  );
}

function hasPromptBlank(prompt) {
  return /_{2,}|\bblank\b/i.test(String(prompt || ''));
}

function resolveQuestionMode(question) {
  const questionType = toText(question?.question_type || question?.type).toLowerCase();
  const choices = getChoiceList(question);
  const viableChoiceCount = choices.filter((choice) => toText(choice).length > 0).length;
  const hasCorrectText = toText(question?.correct_text).length > 0;

  if (questionType === 'fill') return 'fib';
  if (hasPromptBlank(question?.prompt)) return 'fib';
  if (hasCorrectText && viableChoiceCount < 2) return 'fib';
  if (viableChoiceCount >= 2) return 'mcq';
  return 'fib';
}

function resolveExplanationDetails(question, resolvedCorrectAnswerText) {
  const explanation =
    question?.explanation && typeof question.explanation === 'object'
      ? question.explanation
      : null;
  const explanationString = toText(question?.explanation);

  const answer =
    toText(resolvedCorrectAnswerText) ||
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
  const fibInputRef = useRef(null);
  const [index, setIndex] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [userInput, setUserInput] = useState('');
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
    setUserInput('');
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
  const questionMode = useMemo(() => resolveQuestionMode(current), [current]);
  const currentChoices = useMemo(() => getChoiceList(current), [current]);
  const visibleChoices = useMemo(
    () =>
      currentChoices
        .map((choice, rawIndex) => ({ choice: toText(choice), rawIndex }))
        .filter((item) => item.choice.length > 0),
    [currentChoices]
  );
  const resolvedCorrectIndex = useMemo(
    () => resolveCorrectChoiceIndex(current),
    [current]
  );
  const resolvedCorrectChoiceText = useMemo(() => {
    if (!current || currentChoices.length === 0) return '';
    if (typeof resolvedCorrectIndex !== 'number' || resolvedCorrectIndex < 0) return '';
    return toText(currentChoices[resolvedCorrectIndex]);
  }, [current, currentChoices, resolvedCorrectIndex]);
  const resolvedCorrectAnswerText = useMemo(
    () => resolveCorrectAnswerText(current, resolvedCorrectChoiceText),
    [current, resolvedCorrectChoiceText]
  );
  const explanationDetails = useMemo(
    () => resolveExplanationDetails(current, resolvedCorrectAnswerText),
    [current, resolvedCorrectAnswerText]
  );
  const isDone = index >= questions.length;
  const fibIsCorrect = useMemo(() => {
    if (questionMode !== 'fib' || !submitted) return null;
    return (
      normalizeFreeText(userInput) !== '' &&
      normalizeFreeText(userInput) === normalizeFreeText(resolvedCorrectAnswerText)
    );
  }, [questionMode, submitted, userInput, resolvedCorrectAnswerText]);

  const submitAnswer = useCallback(
    async (payload = {}) => {
      if (!current || submitted) return;
      const answerChoiceIndex =
        typeof payload.choiceIndex === 'number' ? payload.choiceIndex : null;
      const answerText = toText(payload.inputText ?? userInput);
      const isFib = questionMode === 'fib';

      if (isFib) {
        setUserInput(answerText);
      } else if (answerChoiceIndex != null) {
        setSelectedIndex(answerChoiceIndex);
      }
      setSubmitted(true);

      const isCorrect = isFib
        ? normalizeFreeText(answerText) !== '' &&
          normalizeFreeText(answerText) === normalizeFreeText(resolvedCorrectAnswerText)
        : typeof resolvedCorrectIndex === 'number' && answerChoiceIndex === resolvedCorrectIndex;
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
    [
      confidence,
      current,
      questionMode,
      resolvedCorrectAnswerText,
      resolvedCorrectIndex,
      submitted,
      title,
      user?.id,
      userInput,
    ]
  );

  const goNext = useCallback(() => {
    if (!submitted) return;
    setIndex((prev) => prev + 1);
    setSelectedIndex(null);
    setUserInput('');
    setConfidence('kinda');
    setSubmitted(false);
  }, [submitted]);

  useEffect(() => {
    function onKeyDown(event) {
      if (isTypingTarget(event.target)) return;
      if (isDone || !current) return;

      const key = event.key.toLowerCase();

      if (questionMode === 'mcq' && ['1', '2', '3', '4'].includes(key)) {
        event.preventDefault();
        const nextChoice = Number(key) - 1;
        if (nextChoice < visibleChoices.length) {
          submitAnswer({ choiceIndex: visibleChoices[nextChoice].rawIndex });
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
  }, [current, goNext, isDone, questionMode, submitAnswer, visibleChoices]);

  useEffect(() => {
    if (questionMode !== 'fib' || submitted) return;
    const input = fibInputRef.current;
    if (!input) return;
    try {
      input.focus({ preventScroll: true });
    } catch {
      input.focus();
    }
  }, [current?.id, questionMode, submitted]);

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
          {questionMode === 'fib'
            ? 'Fill'
            : current.question_type === 'reverse'
              ? 'Reverse'
              : 'MCQ'}
        </span>
      </p>
      <p className="runner-prompt">{current.prompt}</p>

      {questionMode === 'mcq' ? (
        <div className="choice-list">
          {visibleChoices.map(({ choice, rawIndex }, choicePosition) => {
            const isSelected = selectedIndex === rawIndex;
            const isCorrect =
              submitted &&
              typeof resolvedCorrectIndex === 'number' &&
              rawIndex === resolvedCorrectIndex;
            const isWrongSelected = submitted && isSelected && !isCorrect;
            return (
              <button
                key={`${rawIndex}-${choice}`}
                type="button"
                className={`choice-btn${isSelected ? ' selected' : ''}${isCorrect ? ' correct' : ''}${
                  isWrongSelected ? ' wrong' : ''
                }`}
                onClick={() => submitAnswer({ choiceIndex: rawIndex })}
                disabled={submitted}
              >
                {choicePosition + 1}. {choice}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="choice-list">
          <label htmlFor="fib-answer" className="muted">
            Enter your answer:
          </label>
          <input
            id="fib-answer"
            ref={fibInputRef}
            type="text"
            className="choice-btn"
            value={userInput}
            onChange={(event) => setUserInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return;
              event.preventDefault();
              if (submitted) {
                goNext();
              } else {
                submitAnswer({ inputText: userInput });
              }
            }}
            disabled={submitted}
            autoFocus
          />
          <button
            type="button"
            className="choice-btn"
            onClick={() => submitAnswer({ inputText: userInput })}
            disabled={submitted || normalizeFreeText(userInput) === ''}
          >
            Submit
          </button>
        </div>
      )}

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
        <>
          {questionMode === 'fib' ? (
            <p className={`status ${fibIsCorrect ? 'success' : 'error'}`}>
              {fibIsCorrect ? 'Correct' : 'Incorrect'}
              {!fibIsCorrect ? ` Correct answer: ${explanationDetails.answer}` : ''}
            </p>
          ) : null}
        <div className="explanation-box">
          <p>Answer: {explanationDetails.answer}</p>
          <p>Why: {explanationDetails.why}</p>
          <p>Trap: {explanationDetails.trap}</p>
          <p>Hook: {explanationDetails.hook}</p>
        </div>
        </>
      ) : null}

      <button type="button" onClick={goNext} disabled={!submitted}>
        Next (Enter)
      </button>
      <p className="muted">
        {questionMode === 'fib'
          ? 'Hotkeys: S/K/G confidence, Enter submit or next.'
          : 'Hotkeys: 1-4 answer, S/K/G confidence, Enter next.'}
      </p>
      {status ? <p className="status error">{status}</p> : null}
    </section>
  );
}
