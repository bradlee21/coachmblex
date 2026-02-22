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

      const cards = buildMemoryDeck(data || [], MEMORY_DEFAULT_PAIR_COUNT);
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
  }, []);

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

  return (
    <section className="memory-page">
      <div className="button-row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ marginBottom: 0 }}>Memory Match</h1>
        <Link href="/today">Back to Practice</Link>
      </div>
      <p className="muted">
        Match each prompt card to its answer card. Flip two cards at a time. Moves count per pair
        attempt; time starts on your first flip.
      </p>

      {error ? <p className="status error">{error}</p> : null}

      {phase === 'idle' ? (
        <section className="runner">
          <h2>Start Memory Match</h2>
          <p>
            Builds a shuffled board with {MEMORY_DEFAULT_PAIR_COUNT} prompt/answer pairs ({MEMORY_DEFAULT_PAIR_COUNT * 2}{' '}
            cards).
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
        <section className="runner" data-testid="memory-match-board">
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
                  onClick={() => handleCardClick(card.id)}
                  disabled={interactionLocked || card.matched || card.faceUp}
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
    </section>
  );
}
