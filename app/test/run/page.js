'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import QuestionRunner from '../../_components/QuestionRunner';
import { shuffleSessionQuestionChoices } from '../../_components/questionRunnerLogic.mjs';
import { shuffleArray } from '../../_utils/shuffleArray.mjs';
import { getSupabaseClient } from '../../../src/lib/supabaseClient';
import { trackEvent } from '../../../src/lib/trackEvent';

const QUICK_TYPES = ['mcq', 'reverse'];
const TEST_MATCH_COUNT_DEFAULT = 50;
const TEST_MATCH_COUNT_MIN = 5;
const TEST_MATCH_COUNT_MAX = 150;
const TEST_PACK_ID_COLUMN = 'pack_id';
const TEST_FETCH_POOL_MIN = 200;
const KNOWN_PACK_IDS_FETCH_LIMIT = 2000;

function toText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function parseBooleanParam(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();
  return normalized === '1' || normalized === 'true';
}

function parseTestQuestionCount(value) {
  const parsed = Number.parseInt(String(value || ''), 10);
  if (!Number.isFinite(parsed)) return TEST_MATCH_COUNT_DEFAULT;
  return Math.min(TEST_MATCH_COUNT_MAX, Math.max(TEST_MATCH_COUNT_MIN, parsed));
}

function parseCsvParamList(value) {
  if (!value) return [];
  return Array.from(
    new Set(
      String(value)
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    )
  );
}

function parseQuickTypes(value) {
  const parsed = {
    mcq: true,
    reverse: true,
  };
  if (!value) return parsed;
  const values = String(value)
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  if (values.length === 0) return parsed;
  parsed.mcq = values.includes('mcq');
  parsed.reverse = values.includes('reverse');
  if (!parsed.mcq && !parsed.reverse) {
    return { mcq: true, reverse: true };
  }
  return parsed;
}

function toCsv(values) {
  return Array.from(new Set((values || []).filter(Boolean))).join(',');
}

function formatTypesLabel(types) {
  if (!Array.isArray(types) || types.length === 0) return 'No types';
  if (types.length === QUICK_TYPES.length) return 'All types';
  return types
    .map((type) => (type === 'mcq' ? 'MCQ' : 'Reverse'))
    .join(', ');
}

function applyTestPackIdFilters(query, { packIds, types }) {
  let next = query;
  const normalizedPackIds = Array.from(new Set((packIds || []).map((id) => toText(id)).filter(Boolean)));
  if (normalizedPackIds.length > 0) {
    next = next.in(TEST_PACK_ID_COLUMN, normalizedPackIds);
  }
  const allowedTypes = (types || []).filter((type) => QUICK_TYPES.includes(type));
  next = next.in('question_type', allowedTypes.length > 0 ? allowedTypes : QUICK_TYPES);
  return next;
}

async function detectPackIdColumnAvailability(supabase) {
  const { error } = await supabase.from('questions').select(TEST_PACK_ID_COLUMN).limit(1);
  return !error;
}

async function fetchKnownPackIds(supabase) {
  const { data, error } = await supabase
    .from('questions')
    .select('pack_id')
    .order('created_at', { ascending: false })
    .limit(KNOWN_PACK_IDS_FETCH_LIMIT);

  if (error) {
    throw new Error(error.message || 'Failed to load pack ids');
  }

  return Array.from(
    new Set((data || []).map((row) => toText(row?.pack_id)).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b));
}

function buildTestSettingsHref({ n, packIds, random, qtCsv }) {
  const params = new URLSearchParams();
  params.set('n', String(n));
  if ((packIds || []).length > 0) {
    params.set('packs', packIds.join(','));
  }
  if (random) {
    params.set('random', '1');
  }
  if (qtCsv) {
    params.set('qt', qtCsv);
  }
  return `/test?${params.toString()}`;
}

export default function TestRunPage() {
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [notice, setNotice] = useState('');
  const [questions, setQuestions] = useState([]);
  const [sessionMeta, setSessionMeta] = useState({
    n: TEST_MATCH_COUNT_DEFAULT,
    selectedPackIds: [],
    random: true,
    types: QUICK_TYPES,
  });

  const parsedConfig = useMemo(() => {
    const n = parseTestQuestionCount(searchParams.get('n'));
    const requestedPackIds = parseCsvParamList(searchParams.get('packs'));
    const random = parseBooleanParam(searchParams.get('random'));
    const quickTypes = parseQuickTypes(searchParams.get('qt'));
    const types = QUICK_TYPES.filter((type) => quickTypes[type]);
    return {
      n,
      requestedPackIds,
      random,
      types: types.length > 0 ? types : [...QUICK_TYPES],
      qtCsv: searchParams.get('qt') || '',
    };
  }, [searchParams]);
  const runnerConfig = useMemo(() => {
    const modeParam = String(searchParams.get('mode') || '')
      .trim()
      .toLowerCase();
    const feedbackParam = String(searchParams.get('feedback') || '')
      .trim()
      .toLowerCase();
    const revealParam = String(searchParams.get('reveal') || '')
      .trim()
      .toLowerCase();
    return {
      mode: modeParam === 'practice' ? 'practice' : modeParam === 'test' ? 'exam' : 'exam',
      feedbackPolicy: feedbackParam === 'immediate' ? 'immediate' : 'end',
      revealPolicy: revealParam === 'immediate' ? 'immediate' : 'end',
    };
  }, [searchParams]);

  const settingsHref = useMemo(
    () =>
      buildTestSettingsHref({
        n: parsedConfig.n,
        packIds: parsedConfig.requestedPackIds,
        random: parsedConfig.random,
        qtCsv: parsedConfig.qtCsv,
      }),
    [parsedConfig]
  );
  const endHref = settingsHref;

  const handleComplete = useCallback(({ score, total }) => {
    void trackEvent('test_run_complete', {
      correct: Number(score) || 0,
      total: Number(total) || 0,
      requested: parsedConfig.n,
      packCount: sessionMeta.selectedPackIds.length,
      random: sessionMeta.random,
    });
  }, [parsedConfig.n, sessionMeta.random, sessionMeta.selectedPackIds.length]);

  useEffect(() => {
    let cancelled = false;

    async function loadSession() {
      setLoading(true);
      setMessage('');
      setNotice('');
      setQuestions([]);

      const supabase = getSupabaseClient();
      if (!supabase) {
        if (!cancelled) {
          setMessage('Supabase is not configured. Check NEXT_PUBLIC_* environment values.');
          setLoading(false);
        }
        return;
      }

      const packIdColumnAvailable = await detectPackIdColumnAvailability(supabase);
      if (!packIdColumnAvailable) {
        if (!cancelled) {
          setMessage(
            'Testing Center requires questions.pack_id. Run the pack_id SQL migration/backfill and re-import packs.'
          );
          setLoading(false);
        }
        return;
      }

      let knownPackIds = [];
      try {
        knownPackIds = await fetchKnownPackIds(supabase);
      } catch (error) {
        if (!cancelled) {
          setMessage(error instanceof Error ? error.message : String(error));
          setLoading(false);
        }
        return;
      }

      if (knownPackIds.length === 0) {
        if (!cancelled) {
          setMessage(
            'No questions.pack_id values found yet. Run the pack_id backfill script or re-import packs before running tests.'
          );
          setLoading(false);
        }
        return;
      }

      const knownSet = new Set(knownPackIds);
      const requested = parsedConfig.requestedPackIds;
      const validPackIds =
        requested.length === 0
          ? knownPackIds
          : requested.filter((id) => knownSet.has(id));
      const selectedPackIds =
        validPackIds.length > 0 ? Array.from(new Set(validPackIds)) : knownPackIds;

      const fetchLimit = Math.max(TEST_FETCH_POOL_MIN, parsedConfig.n);
      const { data, error } = await applyTestPackIdFilters(
        supabase
          .from('questions')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(fetchLimit),
        { packIds: selectedPackIds, types: parsedConfig.types }
      );

      if (cancelled) return;

      if (error) {
        setMessage(`Failed to load test questions: ${error.message}`);
        setLoading(false);
        return;
      }

      const pool = Array.isArray(data) ? data : [];
      const picked = (parsedConfig.random ? shuffleArray(pool) : pool).slice(0, parsedConfig.n);
      const sessionQuestions = picked.map(shuffleSessionQuestionChoices);

      if (sessionQuestions.length === 0) {
        setMessage('No questions available for the selected test packs and types.');
        setLoading(false);
        return;
      }

      setSessionMeta({
        n: parsedConfig.n,
        selectedPackIds,
        random: parsedConfig.random,
        types: parsedConfig.types,
      });
      setQuestions(sessionQuestions);

      if (sessionQuestions.length < parsedConfig.n) {
        setNotice(
          `Only ${sessionQuestions.length} question(s) available across ${selectedPackIds.length} selected pack(s).`
        );
      } else if (requested.length > 0 && validPackIds.length < requested.length) {
        setNotice(
          `Ignored ${requested.length - validPackIds.length} unknown pack id(s); using ${selectedPackIds.length} pack(s).`
        );
      }

      void trackEvent('test_run_start', {
        requested: parsedConfig.n,
        loaded: sessionQuestions.length,
        packCount: selectedPackIds.length,
        random: parsedConfig.random,
      });

      setLoading(false);
    }

    void loadSession();

    return () => {
      cancelled = true;
    };
  }, [parsedConfig]);

  const summary = `${sessionMeta.n} questions | ${sessionMeta.selectedPackIds.length || 0} pack${
    (sessionMeta.selectedPackIds.length || 0) === 1 ? '' : 's'
  } | Random ${sessionMeta.random ? 'On' : 'Off'}`;

  return (
    <section
      className="test-run-page mx-auto w-full max-w-5xl px-4 pt-4 sm:px-6 sm:pt-6 lg:px-8"
      style={{ paddingBottom: 'calc(5.5rem + var(--mobile-nav-h) + env(safe-area-inset-bottom))' }}
    >
      <div className="test-run-header mb-3">
        <div className="test-run-header__row flex flex-wrap items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white/90 p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900/90">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-3xl">
              Test
            </h1>
            <p className="test-run-summary text-sm text-slate-600 dark:text-slate-300">{summary}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">{formatTypesLabel(sessionMeta.types)}</p>
          </div>
          <div className="button-row test-run-actions">
            <Link href={settingsHref} className="choice-btn">
              Change settings
            </Link>
            <Link href={endHref} className="choice-btn">
              End test
            </Link>
          </div>
        </div>
      </div>

      {loading ? (
        <section className="runner">
          <h2>Starting Test...</h2>
          <p className="muted">Loading questions for your selected packs.</p>
        </section>
      ) : null}

      {!loading && message ? (
        <section className="runner">
          <h2>Unable to Start Test</h2>
          <p className="status error">{message}</p>
          <div className="button-row">
            <Link href={settingsHref} className="choice-btn">
              Back to Testing Center
            </Link>
          </div>
        </section>
      ) : null}

      {!loading && !message ? (
        <>
          {notice ? <p className="status error">{notice}</p> : null}
          <QuestionRunner
            title="Test"
            questions={questions}
            onComplete={handleComplete}
            mode={runnerConfig.mode}
            feedbackPolicy={runnerConfig.feedbackPolicy}
            revealPolicy={runnerConfig.revealPolicy}
          />
        </>
      ) : null}
    </section>
  );
}
