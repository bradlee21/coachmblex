'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import QuestionRunner from '../_components/QuestionRunner';
import {
  getChoiceList,
  resolveExplanationParts,
  shuffleArray,
} from '../_components/questionRunnerLogic.mjs';
import { getSupabaseClient } from '../../src/lib/supabaseClient';
import { trackEvent } from '../../src/lib/trackEvent';

const QUICK_TYPES = ['mcq', 'reverse', 'fill'];
const DRILL_MATCH_COUNT = 10;

function parseQuickTypes(value) {
  const parsed = {
    mcq: true,
    reverse: true,
    fill: true,
  };
  if (!value) return parsed;
  const values = String(value)
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  if (values.length === 0) return parsed;
  parsed.mcq = values.includes('mcq');
  parsed.reverse = values.includes('reverse');
  parsed.fill = values.includes('fill');
  if (!parsed.mcq && !parsed.reverse && !parsed.fill) {
    return {
      mcq: true,
      reverse: true,
      fill: true,
    };
  }
  return parsed;
}

function toCsv(values) {
  return Array.from(new Set((values || []).filter(Boolean))).join(',');
}

function getQuestionType(question) {
  return String(question?.question_type || question?.type || '').toLowerCase();
}

function parseMaybeJson(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function collectText(value, bucket, depth = 0) {
  if (value == null || depth > 3) return;
  if (typeof value === 'string') {
    const parsed = parseMaybeJson(value);
    if (parsed != null) {
      collectText(parsed, bucket, depth + 1);
      return;
    }
    const trimmed = value.trim();
    if (trimmed) bucket.push(trimmed);
    return;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectText(item, bucket, depth + 1);
    return;
  }
  if (typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      const normalizedKey = String(key || '').toLowerCase();
      if (
        normalizedKey.includes('blueprint') ||
        normalizedKey === 'id' ||
        normalizedKey.endsWith('_id') ||
        normalizedKey.endsWith('id')
      ) {
        continue;
      }
      collectText(item, bucket, depth + 1);
    }
  }
}

function buildSubjectSearchHaystack(question) {
  const explanation = resolveExplanationParts(question);
  const bucket = [];
  collectText(question?.prompt, bucket);
  collectText(getChoiceList(question), bucket);
  collectText(question?.tags, bucket);
  collectText(question?.keywords, bucket);
  collectText(question?.keyword, bucket);
  collectText(question?.concepts, bucket);
  collectText(question?.concept_names, bucket);
  collectText(question?.conceptNames, bucket);
  collectText(question?.linked_concepts, bucket);
  collectText(question?.linkedConcepts, bucket);
  collectText(question?.metadata, bucket);
  collectText(question?.source, bucket);
  collectText(question?.answer, bucket);
  collectText(question?.correct_text, bucket);
  collectText(question?.correct_answer, bucket);
  collectText(question?.explanation_answer, bucket);
  collectText(question?.why, bucket);
  collectText(question?.trap, bucket);
  collectText(question?.hook, bucket);
  collectText(question?.explanation_why, bucket);
  collectText(question?.explanation_trap, bucket);
  collectText(question?.explanation_hook, bucket);
  collectText(question?.explanation, bucket);
  collectText(explanation, bucket);
  return bucket.join(' ').toLowerCase();
}

function matchesQuickSearch(question, term) {
  if (!term) return true;
  const haystack = buildSubjectSearchHaystack(question);
  return haystack.includes(term);
}

function formatTypesLabel(typesValue) {
  const values = (typesValue || []).filter(Boolean);
  if (values.length === 0) return 'None';
  if (values.length === QUICK_TYPES.length) return 'All types';
  return values.map((type) => (type === 'mcq' ? 'MCQ' : type === 'reverse' ? 'Reverse' : 'Fill')).join(', ');
}

function buildSessionLabel(searchValue) {
  const trimmed = String(searchValue || '').trim();
  return trimmed ? `Search: ${trimmed}` : 'Broad search';
}

export default function DrillPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const quickSearchRequestIdRef = useRef(0);
  const questionCardRef = useRef(null);

  const [quickSearch, setQuickSearch] = useState('');
  const [quickTypes, setQuickTypes] = useState({
    mcq: true,
    reverse: true,
    fill: true,
  });
  const selectedQuickTypes = useMemo(
    () => QUICK_TYPES.filter((type) => quickTypes[type]),
    [quickTypes]
  );
  const [quickMatches, setQuickMatches] = useState(null);
  const [quickLoading, setQuickLoading] = useState(false);
  const [quickMessage, setQuickMessage] = useState('');
  const [questions, setQuestions] = useState([]);
  const [started, setStarted] = useState(false);
  const [isStartCollapsed, setIsStartCollapsed] = useState(false);
  const [message, setMessage] = useState('');
  const [activeSessionMeta, setActiveSessionMeta] = useState({
    codePrefix: 'quick',
    type: 'any',
    label: 'Broad search',
  });

  const handleDrillComplete = useCallback(
    ({ score, total }) => {
      void trackEvent('drill_complete', {
        codePrefix: activeSessionMeta.codePrefix || 'quick',
        type: activeSessionMeta.type || 'any',
        correct: Number(score) || 0,
        total: Number(total) || 0,
      });
    },
    [activeSessionMeta.codePrefix, activeSessionMeta.type]
  );

  useEffect(() => {
    const quickQuery = searchParams.get('q') || '';
    const quickTypeQuery = searchParams.get('qt');
    setQuickSearch(quickQuery);
    setQuickTypes(parseQuickTypes(quickTypeQuery));
  }, [searchParams]);

  useEffect(() => {
    if (!started || questions.length === 0) return;
    const nextFrame = requestAnimationFrame(() => {
      const element = questionCardRef.current;
      if (!element || typeof element.scrollIntoView !== 'function') return;
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    return () => cancelAnimationFrame(nextFrame);
  }, [questions, started]);

  const fetchQuickMatches = useCallback(async (filters) => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      return {
        matches: [],
        error: 'Supabase is not configured. Check NEXT_PUBLIC_* environment values.',
      };
    }

    const types = filters.types || [];
    if (types.length === 0) {
      return {
        matches: [],
        error: 'Pick at least one type.',
      };
    }

    const { data, error } = await supabase
      .from('questions')
      .select('*')
      .in('question_type', types)
      .order('created_at', { ascending: false })
      .limit(1000);

    if (error) {
      return {
        matches: [],
        error: `Failed to load drill matches: ${error.message}`,
      };
    }

    const term = String(filters.searchTerm || '').trim().toLowerCase();
    const filtered = (data || []).filter((question) => {
      if (!types.includes(getQuestionType(question))) return false;
      return matchesQuickSearch(question, term);
    });

    return {
      matches: filtered,
      error: '',
    };
  }, []);

  const refreshQuickMatches = useCallback(async () => {
    const requestId = quickSearchRequestIdRef.current + 1;
    quickSearchRequestIdRef.current = requestId;
    setQuickLoading(true);
    setQuickMessage('');

    const { matches, error } = await fetchQuickMatches({
      searchTerm: quickSearch,
      types: selectedQuickTypes,
    });

    if (requestId !== quickSearchRequestIdRef.current) return;

    if (error) {
      setQuickMatches(0);
      setQuickMessage(error);
      setQuickLoading(false);
      return;
    }

    const filtered = matches || [];
    setQuickMatches(filtered.length);
    setQuickMessage(filtered.length === 0 ? 'No matches. Try a broader term.' : '');
    setQuickLoading(false);
  }, [fetchQuickMatches, quickSearch, selectedQuickTypes]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void refreshQuickMatches();
    }, 200);
    return () => clearTimeout(timer);
  }, [refreshQuickMatches]);

  function toggleQuickType(type) {
    setQuickTypes((prev) => ({
      ...prev,
      [type]: !prev[type],
    }));
  }

  function buildQuickUrlParams({ searchValue, typesValue }) {
    const params = new URLSearchParams();
    const trimmedSearch = String(searchValue || '').trim();
    if (trimmedSearch) {
      params.set('q', trimmedSearch);
    }
    const typesCsv = toCsv(typesValue);
    if (typesCsv) {
      params.set('qt', typesCsv);
    }
    return params;
  }

  async function startQuickDrillWithFilters({ searchValue, typesValue }) {
    if (!typesValue || typesValue.length === 0) {
      setQuickMessage('Pick at least one type.');
      return;
    }

    setQuickLoading(true);
    setMessage('');

    const { matches, error } = await fetchQuickMatches({
      searchTerm: searchValue,
      types: typesValue,
    });

    if (error) {
      setQuickMessage(error);
      setQuickMatches(0);
      setQuickLoading(false);
      return;
    }

    const filtered = matches || [];
    setQuickMatches(filtered.length);
    if (filtered.length === 0) {
      setQuickMessage('No matches. Try a broader term.');
      setQuickLoading(false);
      return;
    }

    const params = buildQuickUrlParams({
      searchValue,
      typesValue,
    });
    const nextUrl = params.toString() ? `${pathname}?${params.toString()}` : pathname;
    router.push(nextUrl);

    const picked = shuffleArray(filtered).slice(0, DRILL_MATCH_COUNT);
    const quickType = typesValue.length === 1 ? typesValue[0] : 'any';
    const trimmedSearch = String(searchValue || '').trim();
    const quickPrefix = trimmedSearch ? `search:${trimmedSearch}` : 'quick';

    setActiveSessionMeta({
      codePrefix: quickPrefix,
      type: quickType,
      label: buildSessionLabel(trimmedSearch),
    });
    setQuestions(picked);
    setStarted(true);
    setIsStartCollapsed(true);

    void trackEvent('drill_start', { codePrefix: quickPrefix, type: quickType });

    if (picked.length < DRILL_MATCH_COUNT) {
      setMessage(
        `Only ${picked.length} question(s) match this filter. Try a broader term or more types.`
      );
    }

    setQuickMessage('');
    setQuickLoading(false);
  }

  function startQuickDrill() {
    void startQuickDrillWithFilters({
      searchValue: quickSearch,
      typesValue: selectedQuickTypes,
    });
  }

  const cardClass =
    'rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:p-5';
  const sectionTitleClass = 'text-lg font-semibold text-slate-900 dark:text-slate-100';
  const helperTextClass = 'text-sm text-slate-600 dark:text-slate-300';
  const labelClass = 'text-sm font-medium text-slate-700 dark:text-slate-200';
  const inputClass =
    'h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder-slate-500 shadow-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-300 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100 dark:placeholder-slate-400 dark:focus:border-slate-500 dark:focus:ring-slate-600';
  const buttonClass =
    'inline-flex h-11 items-center justify-center rounded-lg border border-slate-800 bg-slate-900 px-4 text-sm font-medium text-white transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-200 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200 dark:focus-visible:ring-slate-500';
  const subtleButtonClass =
    'inline-flex h-10 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800';

  return (
    <section className="mx-auto w-full max-w-6xl px-4 pb-10 pt-6 sm:px-6 lg:px-8">
      <div className="mb-6 space-y-2">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Drill</h1>
        <p className={helperTextClass}>Type a topic and start a {DRILL_MATCH_COUNT}-question drill.</p>
      </div>

      <div className="mx-auto w-full max-w-4xl space-y-4">
        {started && isStartCollapsed ? (
          <div className={`${cardClass} flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between`}>
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Drill in progress</p>
              <p className={helperTextClass}>
                {activeSessionMeta.label || 'Broad search'} | {formatTypesLabel(selectedQuickTypes)} |{' '}
                {questions.length || DRILL_MATCH_COUNT}/{DRILL_MATCH_COUNT} questions
              </p>
            </div>
            <button
              type="button"
              className={subtleButtonClass}
              onClick={() => setIsStartCollapsed(false)}
            >
              Change settings
            </button>
          </div>
        ) : (
          <div className={cardClass}>
            <h2 className={sectionTitleClass}>Start Drill</h2>
            <p className={`${helperTextClass} mt-1`}>
              Type a subject, choose question types, and start.
            </p>

            <div className="mt-4 space-y-3">
              <div className="space-y-1.5">
                <label className={labelClass} htmlFor="drill-quick-search">
                  Subject search
                </label>
                <input
                  id="drill-quick-search"
                  className={inputClass}
                  type="text"
                  placeholder="e.g., integumentary, lymphatic, trigger points, contraindications"
                  value={quickSearch}
                  onChange={(event) => setQuickSearch(event.target.value)}
                />
              </div>

              <div className="space-y-1.5" role="group" aria-label="Drill type filters">
                <span className={labelClass}>Types</span>
                <div className="flex flex-wrap gap-3">
                  <label className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-400 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:focus:ring-slate-500"
                      checked={quickTypes.mcq}
                      onChange={() => toggleQuickType('mcq')}
                    />
                    MCQ
                  </label>
                  <label className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-400 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:focus:ring-slate-500"
                      checked={quickTypes.reverse}
                      onChange={() => toggleQuickType('reverse')}
                    />
                    Reverse
                  </label>
                  <label className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-400 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:focus:ring-slate-500"
                      checked={quickTypes.fill}
                      onChange={() => toggleQuickType('fill')}
                    />
                    Fill
                  </label>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800/50">
                <p className="text-slate-700 dark:text-slate-200">
                  Available questions: <strong>{quickMatches == null ? '...' : quickMatches}</strong>
                </p>
                <p className="text-slate-600 dark:text-slate-300">
                  Count: <strong>{DRILL_MATCH_COUNT}</strong>
                </p>
              </div>

              {quickLoading ? <p className={helperTextClass}>Checking matches...</p> : null}
              {quickMessage ? <p className="status error">{quickMessage}</p> : null}

              <div>
                <button
                  className={buttonClass}
                  type="button"
                  onClick={startQuickDrill}
                  disabled={quickLoading}
                >
                  Start Drill
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {message ? <p className="status error mt-4">{message}</p> : null}

      {started ? (
        <div ref={questionCardRef} className="mx-auto mt-6 w-full max-w-5xl scroll-mt-6">
          <QuestionRunner
            title={`Drill ${activeSessionMeta.label || 'Broad search'}`}
            questions={questions}
            onComplete={handleDrillComplete}
          />
        </div>
      ) : null}
    </section>
  );
}
