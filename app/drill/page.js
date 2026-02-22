'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import QuestionRunner from '../_components/QuestionRunner';
import { shuffleArray } from '../_components/questionRunnerLogic.mjs';
import { getSupabaseClient } from '../../src/lib/supabaseClient';
import { trackEvent } from '../../src/lib/trackEvent';

const QUICK_TYPES = ['mcq', 'reverse', 'fill'];
const DRILL_MATCH_COUNT = 10;
const DRILL_PACK_LIST_LIMIT = 2000;
const DRILL_START_FETCH_LIMIT = 200;

const PACK_FILTER_STRATEGIES = [
  { key: 'pack_id', kind: 'column', path: 'pack_id', label: 'pack_id' },
  { key: 'source_pack', kind: 'column', path: 'source_pack', label: 'source_pack' },
  { key: 'source_json_pack_id', kind: 'json', path: 'source->>pack_id', label: 'source->>pack_id' },
  { key: 'source_json_packId', kind: 'json', path: 'source->>packId', label: 'source->>packId' },
  { key: 'metadata_json_pack_id', kind: 'json', path: 'metadata->>pack_id', label: 'metadata->>pack_id' },
  { key: 'metadata_json_packId', kind: 'json', path: 'metadata->>packId', label: 'metadata->>packId' },
  // Fallback for older imports that did not persist pack ids onto questions rows.
  { key: 'domain', kind: 'column', path: 'domain', label: 'domain' },
];

function toText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

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

function parseMaybeObject(value) {
  if (!value) return null;
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return null;
  try {
    const parsed = JSON.parse(trimmed);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function titleCaseWords(value) {
  return String(value || '')
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function humanizePackId(packId) {
  const raw = toText(packId);
  if (!raw) return '';
  let label = raw.replace(/^ch\d+-/i, '');
  label = label.replace(/-class-v\d+$/i, '');
  label = label.replace(/-v\d+$/i, '');
  label = label.replace(/[-_]+/g, ' ');
  label = label.replace(/\bpack\b/gi, '').replace(/\s{2,}/g, ' ').trim();
  return titleCaseWords(label || raw.replace(/[-_]+/g, ' '));
}

function resolveQuestionPackInfo(question) {
  const sourceObject = parseMaybeObject(question?.source);
  const metadataObject = parseMaybeObject(question?.metadata);

  const packId =
    toText(question?.pack_id) ||
    toText(question?.packId) ||
    toText(question?.source_pack) ||
    toText(question?.sourcePack) ||
    toText(sourceObject?.pack_id) ||
    toText(sourceObject?.packId) ||
    toText(metadataObject?.pack_id) ||
    toText(metadataObject?.packId) ||
    toText(question?.domain);

  const packLabel =
    toText(question?.pack_title) ||
    toText(question?.packTitle) ||
    toText(question?.source_pack_title) ||
    toText(question?.sourcePackTitle) ||
    toText(sourceObject?.pack_title) ||
    toText(sourceObject?.packTitle) ||
    toText(sourceObject?.title) ||
    toText(metadataObject?.pack_title) ||
    toText(metadataObject?.packTitle) ||
    toText(metadataObject?.title) ||
    humanizePackId(packId);

  return {
    packId,
    packLabel: packLabel || packId,
  };
}

function formatTypesLabel(typesValue) {
  const values = (typesValue || []).filter(Boolean);
  if (values.length === 0) return 'None';
  if (values.length === QUICK_TYPES.length) return 'All types';
  return values
    .map((type) => (type === 'mcq' ? 'MCQ' : type === 'reverse' ? 'Reverse' : 'Fill'))
    .join(', ');
}

function buildSessionLabel(packLabel, searchText) {
  const subject = toText(packLabel) || 'Subject';
  const q = toText(searchText);
  return q ? `Subject: ${subject} (${q})` : `Subject: ${subject}`;
}

function sanitizeSearchTerm(value) {
  return toText(value)
    .replace(/[,%()_'"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildTextSearchOrClause(searchTerm) {
  const safe = sanitizeSearchTerm(searchTerm);
  if (!safe) return '';
  const pattern = `%${safe}%`;
  return [
    `prompt.ilike.${pattern}`,
    `explanation.ilike.${pattern}`,
    `domain.ilike.${pattern}`,
    `subtopic.ilike.${pattern}`,
  ].join(',');
}

function isJsonOperatorPath(path) {
  return typeof path === 'string' && (path.includes('->>') || path.includes('->'));
}

function resolveStrategyProbeValueFromRow(row, strategy) {
  if (!row || !strategy) return '';
  if (strategy.kind === 'column') {
    return toText(row?.[strategy.path]);
  }

  const [root, jsonKey] = String(strategy.path).split('->>').map((part) => part?.trim());
  if (!root || !jsonKey) return '';
  const parsed = parseMaybeObject(row?.[root]);
  return toText(parsed?.[jsonKey]);
}

function applyPackFilter(query, strategy, packId) {
  if (!strategy || !toText(packId)) return query;
  const value = toText(packId);
  // Supabase/PostgREST JSON operator paths (e.g. source->>pack_id) must use .filter(path, 'eq', value).
  // Direct columns should use .eq(column, value).
  if (isJsonOperatorPath(strategy.path)) {
    return query.filter(strategy.path, 'eq', value);
  }
  return query.eq(strategy.path, value);
}

function applyDrillFilters(query, { packStrategy, packId, types, searchText }) {
  let next = applyPackFilter(query, packStrategy, packId);
  if (Array.isArray(types) && types.length > 0) {
    next = next.in('question_type', types);
  }
  const orClause = buildTextSearchOrClause(searchText);
  if (orClause) {
    next = next.or(orClause);
  }
  return next;
}

async function detectPackFilterStrategy(supabase) {
  const { data: sampleRow } = await supabase
    .from('questions')
    .select('*')
    .limit(1)
    .maybeSingle();

  for (const strategy of PACK_FILTER_STRATEGIES) {
    const sampleValue = resolveStrategyProbeValueFromRow(sampleRow, strategy);
    const probeValue = sampleValue || '__pack_probe__';
    const { error } = await applyPackFilter(
      supabase.from('questions').select('id').limit(1),
      strategy,
      probeValue
    );
    if (!error) {
      return strategy;
    }
  }
  return null;
}

export default function DrillPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const questionCardRef = useRef(null);

  const [packs, setPacks] = useState([]);
  const [packsLoading, setPacksLoading] = useState(false);
  const [packsError, setPacksError] = useState('');
  const [packFilterStrategy, setPackFilterStrategy] = useState(null);
  const [selectedPackId, setSelectedPackId] = useState('');
  const [subjectSearch, setSubjectSearch] = useState('');

  const [quickTypes, setQuickTypes] = useState({
    mcq: true,
    reverse: true,
    fill: true,
  });
  const selectedQuickTypes = useMemo(
    () => QUICK_TYPES.filter((type) => quickTypes[type]),
    [quickTypes]
  );

  const [availableCount, setAvailableCount] = useState(0);
  const [countLoading, setCountLoading] = useState(false);
  const [countMessage, setCountMessage] = useState('');

  const [questions, setQuestions] = useState([]);
  const [started, setStarted] = useState(false);
  const [isStartCollapsed, setIsStartCollapsed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [activeSessionMeta, setActiveSessionMeta] = useState({
    codePrefix: 'pack',
    type: 'any',
    label: 'Subject drill',
    packId: '',
  });

  const selectedPack = useMemo(
    () => packs.find((pack) => pack.id === selectedPackId) || null,
    [packs, selectedPackId]
  );

  const handleDrillComplete = useCallback(
    ({ score, total }) => {
      void trackEvent('drill_complete', {
        codePrefix: activeSessionMeta.codePrefix || 'pack',
        type: activeSessionMeta.type || 'any',
        correct: Number(score) || 0,
        total: Number(total) || 0,
      });
    },
    [activeSessionMeta.codePrefix, activeSessionMeta.type]
  );

  useEffect(() => {
    const packQuery = searchParams.get('pk') || '';
    const quickTypeQuery = searchParams.get('qt');
    const q = searchParams.get('q') || '';
    setSelectedPackId(packQuery);
    setSubjectSearch(q);
    setQuickTypes(parseQuickTypes(quickTypeQuery));
  }, [searchParams]);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setPacksError('Supabase is not configured. Check NEXT_PUBLIC_* environment values.');
      setPacks([]);
      setPackFilterStrategy(null);
      return;
    }

    let cancelled = false;

    async function loadSubjects() {
      setPacksLoading(true);
      setPacksError('');

      const strategy = await detectPackFilterStrategy(supabase);
      if (cancelled) return;
      setPackFilterStrategy(strategy);
      if (!strategy) {
        setPacks([]);
        setPacksError('No supported pack field found on questions table.');
        setPacksLoading(false);
        return;
      }

      // Pack picker still derives labels from existing row payloads; count/start use server filtering.
      const { data, error } = await supabase
        .from('questions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(DRILL_PACK_LIST_LIMIT);

      if (cancelled) return;

      if (error) {
        setPacksError(`Failed to load subjects: ${error.message}`);
        setPacks([]);
        setPacksLoading(false);
        return;
      }

      const packMap = new Map();
      for (const question of data || []) {
        const questionType = getQuestionType(question);
        if (!QUICK_TYPES.includes(questionType)) continue;
        const { packId, packLabel } = resolveQuestionPackInfo(question);
        if (!packId) continue;
        const existing = packMap.get(packId);
        if (existing) {
          existing.total += 1;
          if (!existing.label && packLabel) existing.label = packLabel;
        } else {
          packMap.set(packId, {
            id: packId,
            label: packLabel || humanizePackId(packId) || packId,
            total: 1,
          });
        }
      }

      const nextPacks = Array.from(packMap.values()).sort(
        (a, b) => a.label.localeCompare(b.label) || a.id.localeCompare(b.id)
      );
      setPacks(nextPacks);
      setPacksLoading(false);
    }

    void loadSubjects();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!started || questions.length === 0) return;
    const nextFrame = requestAnimationFrame(() => {
      const element = questionCardRef.current;
      if (!element || typeof element.scrollIntoView !== 'function') return;
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    return () => cancelAnimationFrame(nextFrame);
  }, [questions, started]);

  const refreshAvailableCount = useCallback(async () => {
    if (!selectedPackId) {
      setAvailableCount(0);
      setCountMessage('');
      setCountLoading(false);
      return;
    }
    if (!packFilterStrategy) {
      setAvailableCount(0);
      setCountMessage(packsError ? '' : 'Pack filtering is unavailable.');
      setCountLoading(false);
      return;
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      setAvailableCount(0);
      setCountMessage('Supabase is not configured. Check NEXT_PUBLIC_* environment values.');
      setCountLoading(false);
      return;
    }

    setCountLoading(true);
    setCountMessage('');

    const { count, error } = await applyDrillFilters(
      supabase.from('questions').select('id', { head: true, count: 'exact' }),
      {
        packStrategy: packFilterStrategy,
        packId: selectedPackId,
        types: selectedQuickTypes,
        searchText: subjectSearch,
      }
    );

    if (error) {
      setAvailableCount(0);
      setCountMessage(`Failed to load available count: ${error.message}`);
      setCountLoading(false);
      return;
    }

    setAvailableCount(count ?? 0);
    setCountLoading(false);
  }, [packFilterStrategy, packsError, selectedPackId, selectedQuickTypes, subjectSearch]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void refreshAvailableCount();
    }, 200);
    return () => clearTimeout(timer);
  }, [refreshAvailableCount]);

  function toggleQuickType(type) {
    setQuickTypes((prev) => ({
      ...prev,
      [type]: !prev[type],
    }));
  }

  function buildDrillUrlParams({ packId, searchValue, typesValue }) {
    const params = new URLSearchParams();
    const normalizedPackId = toText(packId);
    if (normalizedPackId) {
      params.set('pk', normalizedPackId);
    }
    const trimmedSearch = toText(searchValue);
    if (trimmedSearch) {
      params.set('q', trimmedSearch);
    }
    const typesCsv = toCsv(typesValue);
    if (typesCsv) {
      params.set('qt', typesCsv);
    }
    return params;
  }

  async function startPackDrill() {
    if (!selectedPackId) {
      setMessage('Choose a subject to start.');
      return;
    }
    if (selectedQuickTypes.length === 0) {
      setMessage('Pick at least one type.');
      return;
    }
    if (!packFilterStrategy) {
      setMessage('Pack filtering is unavailable for this questions schema.');
      return;
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      setMessage('Supabase is not configured. Check NEXT_PUBLIC_* environment values.');
      return;
    }

    setLoading(true);
    setMessage('');

    const params = buildDrillUrlParams({
      packId: selectedPackId,
      searchValue: subjectSearch,
      typesValue: selectedQuickTypes,
    });
    const nextUrl = params.toString() ? `${pathname}?${params.toString()}` : pathname;
    router.push(nextUrl);

    const { data, error } = await applyDrillFilters(
      supabase
        .from('questions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(DRILL_START_FETCH_LIMIT),
      {
        packStrategy: packFilterStrategy,
        packId: selectedPackId,
        types: selectedQuickTypes,
        searchText: subjectSearch,
      }
    );

    if (error) {
      setMessage(`Failed to load drill questions: ${error.message}`);
      setLoading(false);
      return;
    }

    const picked = shuffleArray(data || []).slice(0, DRILL_MATCH_COUNT);
    if (picked.length === 0) {
      setMessage('No questions available for this subject and filter.');
      setLoading(false);
      return;
    }

    const quickType = selectedQuickTypes.length === 1 ? selectedQuickTypes[0] : 'any';
    const label = selectedPack?.label || humanizePackId(selectedPackId) || selectedPackId;

    setActiveSessionMeta({
      codePrefix: `pack:${selectedPackId}`,
      type: quickType,
      label: buildSessionLabel(label, subjectSearch),
      packId: selectedPackId,
    });
    setQuestions(picked);
    setStarted(true);
    setIsStartCollapsed(true);

    void trackEvent('drill_start', { codePrefix: `pack:${selectedPackId}`, type: quickType });

    if (picked.length < DRILL_MATCH_COUNT) {
      setMessage(`Only ${picked.length} question(s) available for ${label} with this filter.`);
    }

    setLoading(false);
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
        <p className={helperTextClass}>Pick a subject and start a {DRILL_MATCH_COUNT}-question drill.</p>
      </div>

      <div className="mx-auto w-full max-w-4xl space-y-4">
        {started && isStartCollapsed ? (
          <div className={`${cardClass} flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between`}>
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Drill in progress</p>
              <p className={helperTextClass}>
                {activeSessionMeta.label || 'Subject drill'} | {formatTypesLabel(selectedQuickTypes)} |{' '}
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
              Choose a subject, optionally search within it, then start.
            </p>

            <div className="mt-4 space-y-3">
              <div className="space-y-1.5">
                <label className={labelClass} htmlFor="drill-pack-select">
                  Subject
                </label>
                <select
                  id="drill-pack-select"
                  className={inputClass}
                  value={selectedPackId}
                  onChange={(event) => setSelectedPackId(event.target.value)}
                  disabled={packsLoading || packs.length === 0}
                >
                  <option value="">Choose a subject...</option>
                  {packs.map((pack) => (
                    <option key={pack.id} value={pack.id}>
                      {pack.label}
                    </option>
                  ))}
                </select>
                {packsLoading ? <p className={helperTextClass}>Loading subjects...</p> : null}
                {packsError ? <p className="status error">{packsError}</p> : null}
              </div>

              <div className="space-y-1.5">
                <label className={labelClass} htmlFor="drill-pack-search">
                  Search within subject
                </label>
                <input
                  id="drill-pack-search"
                  className={inputClass}
                  type="text"
                  placeholder="e.g., trigger points, contraindications, lymph flow"
                  value={subjectSearch}
                  onChange={(event) => setSubjectSearch(event.target.value)}
                  disabled={!selectedPackId}
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
                  Available questions: <strong>{selectedPackId ? availableCount : 0}</strong>
                </p>
                <p className="text-slate-600 dark:text-slate-300">
                  Count: <strong>{DRILL_MATCH_COUNT}</strong>
                </p>
              </div>

              {countLoading ? <p className={helperTextClass}>Checking available questions...</p> : null}
              {countMessage ? <p className="status error">{countMessage}</p> : null}

              <div>
                <button
                  className={buttonClass}
                  type="button"
                  onClick={() => void startPackDrill()}
                  disabled={loading || packsLoading || !selectedPackId}
                >
                  {loading ? 'Loading...' : 'Start Drill'}
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
            title={`Drill ${activeSessionMeta.label || 'Subject drill'}`}
            questions={questions}
            onComplete={handleDrillComplete}
          />
        </div>
      ) : null}
    </section>
  );
}
