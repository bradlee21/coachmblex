'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getSupabaseClient } from '../../src/lib/supabaseClient';
import {
  MEMORY_DEFAULT_PAIR_COUNT,
  buildMemoryDeck,
  canFlip,
  flipCard,
  isWin,
  resolveTurn,
} from './memoryLogic.mjs';

const MEMORY_FETCH_LIMIT = 200;
const MISMATCH_DELAY_MS = 800;
const MEMORY_MOBILE_PAIR_COUNT = 4;
const MEMORY_MOBILE_MEDIA_QUERY = '(max-width: 899px)';

function createMemoryGameState(cards = []) {
  return {
    cards,
    moves: 0,
    startedAtMs: null,
  };
}

function formatElapsed(elapsedMs) {
  const totalSeconds = Math.max(0, Math.floor((Number(elapsedMs) || 0) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function countMatchedPairs(cards) {
  const pairIds = new Set((cards || []).filter((card) => card.matched).map((card) => card.pairId));
  return pairIds.size;
}

export default function MemoryPage() {
  const mismatchTimeoutRef = useRef(null);
  const gameStateRef = useRef(createMemoryGameState());
  const [phase, setPhase] = useState('idle');
  const [gameState, setGameState] = useState(() => createMemoryGameState());
  const [interactionLocked, setInteractionLocked] = useState(false);
  const [error, setError] = useState('');
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [resultElapsedMs, setResultElapsedMs] = useState(0);
  const [pairCount, setPairCount] = useState(MEMORY_DEFAULT_PAIR_COUNT);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [previewCard, setPreviewCard] = useState(null);

  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  useEffect(() => {
    return () => {
      if (mismatchTimeoutRef.current) {
        clearTimeout(mismatchTimeoutRef.current);
        mismatchTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mediaQuery = window.matchMedia(MEMORY_MOBILE_MEDIA_QUERY);
    const syncPairCount = () => {
      setIsMobileViewport(mediaQuery.matches);
      setPairCount(
        mediaQuery.matches ? MEMORY_MOBILE_PAIR_COUNT : MEMORY_DEFAULT_PAIR_COUNT
      );
    };
    syncPairCount();
    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', syncPairCount);
      return () => mediaQuery.removeEventListener('change', syncPairCount);
    }
    mediaQuery.addListener(syncPairCount);
    return () => mediaQuery.removeListener(syncPairCount);
  }, []);

  useEffect(() => {
    if (phase !== 'playing') {
      setPreviewCard(null);
    }
  }, [phase]);

  useEffect(() => {
    if (phase !== 'playing' || gameState.startedAtMs == null) return;
    const intervalId = setInterval(() => {
      setNowMs(Date.now());
    }, 250);
    return () => clearInterval(intervalId);
  }, [gameState.startedAtMs, phase]);

  const totalPairs = useMemo(() => Math.floor((gameState.cards?.length || 0) / 2), [gameState.cards]);
  const matchedPairs = useMemo(() => countMatchedPairs(gameState.cards), [gameState.cards]);
  const elapsedMs =
    phase === 'complete'
      ? resultElapsedMs
      : gameState.startedAtMs == null
        ? 0
        : Math.max(0, nowMs - gameState.startedAtMs);

  const startMemoryMatch = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setError('Supabase is not configured. Check NEXT_PUBLIC_* environment values.');
      setPhase('idle');
      return;
    }

    if (mismatchTimeoutRef.current) {
      clearTimeout(mismatchTimeoutRef.current);
      mismatchTimeoutRef.current = null;
    }

    setError('');
    setPhase('loading');
    setInteractionLocked(false);
    setResultElapsedMs(0);
    setNowMs(Date.now());
    setGameState(createMemoryGameState());

    try {
      const { data, error: queryError } = await supabase
        .from('questions')
        .select('*')
        .not('blueprint_code', 'is', null)
        .order('created_at', { ascending: false })
        .limit(MEMORY_FETCH_LIMIT);

      if (queryError) {
        setError(queryError.message || 'Failed to load memory match questions.');
        setPhase('idle');
        return;
      }

      const cards = buildMemoryDeck(data || [], pairCount);
      if (cards.length < 2) {
        setError('Not enough questions available for Memory Match yet.');
        setPhase('idle');
        return;
      }

      setGameState(createMemoryGameState(cards));
      setPhase('playing');
    } catch (loadError) {
      const message =
        loadError instanceof Error ? loadError.message : 'Failed to load memory match questions.';
      setError(message);
      setPhase('idle');
    }
  }, [pairCount]);

  const finishGame = useCallback((nextState, resolvedAtMs = Date.now()) => {
    const startedAtMs = Number(nextState?.startedAtMs);
    const safeResolvedAtMs = Number(resolvedAtMs) || Date.now();
    const elapsed = Number.isFinite(startedAtMs) && startedAtMs > 0 ? safeResolvedAtMs - startedAtMs : 0;
    setResultElapsedMs(Math.max(0, elapsed));
    setInteractionLocked(false);
    setPhase('complete');
  }, []);

  const handleCardClick = useCallback(
    (cardId) => {
      if (phase !== 'playing' || interactionLocked) return;

      const currentState = gameStateRef.current;
      if (!canFlip(currentState, cardId)) return;

      const now = Date.now();
      const flippedState = flipCard(currentState, cardId, now);
      const faceUpUnmatched = flippedState.cards.filter((card) => card.faceUp && !card.matched);

      if (faceUpUnmatched.length < 2) {
        setGameState(flippedState);
        return;
      }

      const resolution = resolveTurn(flippedState);
      if (resolution.outcome === 'match') {
        setGameState(resolution.state);
        if (isWin(resolution.state)) {
          finishGame(resolution.state, now);
        }
        return;
      }

      setGameState(flippedState);
      setInteractionLocked(true);
      if (mismatchTimeoutRef.current) {
        clearTimeout(mismatchTimeoutRef.current);
      }
      mismatchTimeoutRef.current = setTimeout(() => {
        const nextResolution = resolveTurn(gameStateRef.current);
        setGameState(nextResolution.state);
        setInteractionLocked(false);
        mismatchTimeoutRef.current = null;
      }, MISMATCH_DELAY_MS);
    },
    [finishGame, interactionLocked, phase]
  );

  const handleMemoryCardPress = useCallback(
    (card) => {
      if (!card) return;
      if (interactionLocked) return;
      const isVisible = card.faceUp || card.matched;
      if (isMobileViewport && isVisible) {
        setPreviewCard({
          kind: card.kind,
          text: card.text,
        });
        return;
      }
      handleCardClick(card.id);
    },
    [handleCardClick, interactionLocked, isMobileViewport]
  );

  return (
    <section
      className={`memory-page memory-match-page${phase === 'playing' ? ' memory-page--playing' : ''}`}
    >
      <div
        className="button-row memory-page-header"
        style={{ justifyContent: 'space-between', alignItems: 'center' }}
      >
        <h1 style={{ marginBottom: 0 }}>Memory Match</h1>
        <Link className="memory-page-back-link" href="/today">
          Back to Practice
        </Link>
      </div>
      <p className="muted memory-page-description">
        Match each prompt card to its answer card. Flip two cards at a time. Moves count per pair
        attempt; time starts on your first flip.
      </p>

      {error ? <p className="status error">{error}</p> : null}

      {phase === 'idle' ? (
        <section className="runner">
          <h2>Start Memory Match</h2>
          <p>
            Builds a shuffled board with {pairCount} prompt/answer pairs ({pairCount * 2} cards).
          </p>
          <div className="button-row">
            <button type="button" onClick={() => void startMemoryMatch()}>
              Start Memory Match
            </button>
          </div>
        </section>
      ) : null}

      {phase === 'loading' ? (
        <section className="runner">
          <h2>Loading Memory Match...</h2>
          <p className="muted">Preparing shuffled prompt/answer pairs.</p>
        </section>
      ) : null}

      {phase === 'playing' ? (
        <section className="runner memory-board-panel" data-testid="memory-match-board">
          <div className="memory-status">
            <p className="muted" style={{ margin: 0 }}>
              Pairs: {matchedPairs}/{totalPairs}
            </p>
            <p className="muted" style={{ margin: 0 }}>
              Moves: {gameState.moves}
            </p>
            <p className="muted" style={{ margin: 0 }}>
              Time: {formatElapsed(elapsedMs)}
            </p>
          </div>
          {interactionLocked ? <p className="muted">Mismatch. Flipping back...</p> : null}

          <div className="memory-grid">
            {gameState.cards.map((card) => {
              const isVisible = card.faceUp || card.matched;
              const cardClassName = [
                'memory-card',
                isVisible ? 'is-face-up' : '',
                card.matched ? 'is-matched' : '',
              ]
                .filter(Boolean)
                .join(' ');

              return (
                <button
                  key={card.id}
                  type="button"
                  className={cardClassName}
                  onClick={() => handleMemoryCardPress(card)}
                  disabled={
                    interactionLocked || (!isMobileViewport && (card.matched || card.faceUp))
                  }
                  aria-pressed={isVisible}
                  data-kind={card.kind}
                >
                  {isVisible ? (
                    <>
                      <span className="memory-badge">{card.kind === 'prompt' ? 'Q' : 'A'}</span>
                      <span className="memory-card-text">{card.text}</span>
                    </>
                  ) : (
                    <span className="memory-card-placeholder">?</span>
                  )}
                </button>
              );
            })}
          </div>
        </section>
      ) : null}

      {phase === 'complete' ? (
        <section className="runner">
          <h2>Memory Match Complete</h2>
          <p>You matched all {totalPairs} pairs.</p>
          <p>Moves: {gameState.moves}</p>
          <p>Time: {formatElapsed(elapsedMs)}</p>
          <p>Pairs matched: {matchedPairs}</p>
          <div className="button-row">
            <button type="button" onClick={() => void startMemoryMatch()}>
              Play again
            </button>
            <Link href="/today">Back to Practice</Link>
          </div>
        </section>
      ) : null}

      {previewCard ? (
        <div
          className="feedback-overlay memory-card-preview-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="memory-card-preview-title"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setPreviewCard(null);
            }
          }}
        >
          <section className="feedback-modal memory-card-preview">
            <div className="drawer-header">
              <h2 id="memory-card-preview-title" style={{ margin: 0 }}>
                {previewCard.kind === 'prompt' ? 'Question card' : 'Answer card'}
              </h2>
              <button type="button" onClick={() => setPreviewCard(null)}>
                Close
              </button>
            </div>
            <p className="memory-card-preview-text">{previewCard.text}</p>
          </section>
        </div>
      ) : null}
    </section>
  );
}
