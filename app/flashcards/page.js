'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { getSupabaseClient } from '../../src/lib/supabaseClient';
import { useAuth } from '../../src/providers/AuthProvider';
import {
  FLASHCARD_RATINGS,
  applyFlashcardOutcome,
  getFlashcardStorageKey,
  parseFlashcardOutcomes,
  rankFlashcardQuestions,
  resolveFlashcardBackDetails,
  resolveFlashcardHotkeyAction,
  serializeFlashcardOutcomes,
  toggleFlashcardSide,
} from './flashcardLogic.mjs';

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

export default function FlashcardsPage() {
  const { user } = useAuth();
  const [cards, setCards] = useState([]);
  const [outcomes, setOutcomes] = useState({});
  const [index, setIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const storageKey = useMemo(() => getFlashcardStorageKey(user?.id), [user?.id]);
  const currentCard = cards[index] || null;
  const isComplete = cards.length > 0 && index >= cards.length;
  const details = useMemo(() => resolveFlashcardBackDetails(currentCard), [currentCard]);

  const saveOutcomes = useCallback(
    (nextOutcomes) => {
      if (typeof window === 'undefined') return;
      try {
        window.localStorage.setItem(storageKey, serializeFlashcardOutcomes(nextOutcomes));
      } catch {
        // Ignore storage write errors; session can continue without persistence.
      }
    },
    [storageKey]
  );

  const handleFlip = useCallback(() => {
    if (!currentCard) return;
    setIsFlipped((prev) => toggleFlashcardSide(prev));
  }, [currentCard]);

  const handleRate = useCallback(
    (rating) => {
      if (!currentCard || !isFlipped) return;
      setOutcomes((prev) => {
        const nextOutcomes = applyFlashcardOutcome(prev, currentCard.id, rating, Date.now());
        saveOutcomes(nextOutcomes);
        return nextOutcomes;
      });
      setIndex((prev) => prev + 1);
      setIsFlipped(false);
    },
    [currentCard, isFlipped, saveOutcomes]
  );

  useEffect(() => {
    let isCancelled = false;

    async function loadCards() {
      setLoading(true);
      setError('');
      setIndex(0);
      setIsFlipped(false);

      let storedOutcomes = {};
      if (typeof window !== 'undefined') {
        try {
          storedOutcomes = parseFlashcardOutcomes(window.localStorage.getItem(storageKey));
        } catch {
          storedOutcomes = {};
        }
      }
      if (!isCancelled) {
        setOutcomes(storedOutcomes);
      }

      const supabase = getSupabaseClient();
      if (!supabase) {
        if (!isCancelled) {
          setError('Supabase is not configured. Check NEXT_PUBLIC_* environment values.');
          setCards([]);
          setLoading(false);
        }
        return;
      }

      const selectFields =
        'id,prompt,choices,correct_index,correct_text,correct_answer,answer,explanation,why,trap,hook,explanation_answer,explanation_why,explanation_trap,explanation_hook,question_type,blueprint_code,created_at';

      try {
        const { data, error: queryError } = await supabase
          .from('questions')
          .select(selectFields)
          .not('blueprint_code', 'is', null)
          .order('created_at', { ascending: false })
          .limit(120);

        if (isCancelled) return;
        if (queryError) {
          setError(queryError.message || 'Failed to load flashcards.');
          setCards([]);
          return;
        }

        setCards(rankFlashcardQuestions(data || [], storedOutcomes, 20));
      } catch (loadError) {
        if (isCancelled) return;
        const message = loadError instanceof Error ? loadError.message : 'Failed to load flashcards.';
        setError(message);
        setCards([]);
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    }

    loadCards();
    return () => {
      isCancelled = true;
    };
  }, [storageKey]);

  useEffect(() => {
    function onKeyDown(event) {
      if (isTypingTarget(event.target)) return;
      if (loading || error || !currentCard) return;

      const action = resolveFlashcardHotkeyAction({
        key: event.key,
        isFlipped,
      });
      if (!action) return;

      event.preventDefault();
      if (action.type === 'flip') {
        setIsFlipped((prev) => toggleFlashcardSide(prev));
        return;
      }
      if (action.type === 'rate') {
        handleRate(action.rating);
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [currentCard, error, handleRate, isFlipped, loading]);

  function resetDeck() {
    setIndex(0);
    setIsFlipped(false);
    setCards((prev) => rankFlashcardQuestions(prev, outcomes, 20));
  }

  return (
    <section className="flashcards-page">
      <h1>Flashcards</h1>
      <p className="muted">
        Flip with Space, then rate with 1-4: Again, Hard, Good, Easy.
      </p>

      {loading ? <p>Loading flashcards...</p> : null}
      {error ? <p className="status error">{error}</p> : null}

      {!loading && !error && cards.length === 0 ? (
        <div className="runner">
          <p>No flashcards available yet.</p>
        </div>
      ) : null}

      {!loading && !error && currentCard ? (
        <article className="runner flashcard-card" data-testid="flashcard-card">
          <div className="flashcard-meta">
            <p className="muted">
              Card {index + 1} of {cards.length}
            </p>
            <span className="qtype-badge">{isFlipped ? 'Back' : 'Front'}</span>
          </div>

          {!isFlipped ? (
            <p className="runner-prompt">{currentCard.prompt}</p>
          ) : (
            <div className="flashcard-back">
              <p className="flashcard-answer">Answer: {details.answer}</p>
              <details>
                <summary>Why / Trap / Hook</summary>
                <p>Why: {details.why}</p>
                <p>Trap: {details.trap}</p>
                <p>Hook: {details.hook}</p>
              </details>
            </div>
          )}

          <div className="button-row flashcard-actions">
            <button type="button" onClick={handleFlip}>
              {isFlipped ? 'Show Prompt (Space)' : 'Flip (Space)'}
            </button>
          </div>

          <div className="button-row flashcard-ratings">
            {FLASHCARD_RATINGS.map((rating) => (
              <button
                key={rating.value}
                type="button"
                onClick={() => handleRate(rating.value)}
                disabled={!isFlipped}
              >
                {rating.label} ({rating.key})
              </button>
            ))}
          </div>
        </article>
      ) : null}

      {!loading && !error && isComplete ? (
        <div className="runner">
          <h2>Flashcards Complete</h2>
          <p>
            Reviewed {cards.length} cards.
          </p>
          <button type="button" onClick={resetDeck}>
            Review Again
          </button>
        </div>
      ) : null}
    </section>
  );
}
