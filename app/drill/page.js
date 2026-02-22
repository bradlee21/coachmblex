'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import QuestionRunner from '../_components/QuestionRunner';
import { shuffleArray } from '../_components/questionRunnerLogic.mjs';
import { getSupabaseClient } from '../../src/lib/supabaseClient';
import { trackEvent } from '../../src/lib/trackEvent';

const QUICK_TYPES = ['mcq', 'reverse', 'fill'];
const DRILL_MATCH_COUNT = 10;
const DRILL_POOL_LIMIT = 2000;

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
    toText(metadataObject?.packId);

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

function buildSessionLabel(packLabel) {
  const trimmed = toText(packLabel);
  return trimmed ? `Subject: ${trimmed}` : 'Subject drill';
}

export default function DrillPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const questionCardRef = useRef(null);

  const [poolEntries, setPoolEntries] = useState([]);
  const [packs, setPacks] = useState([]);
  const [packsLoading, setPacksLoading] = useState(false);
  const [packsError, setPacksError] = useState('');
  const [selectedPackId, setSelectedPackId] = useState('');

  const [quickTypes, setQuickTypes] = useState({
    mcq: true,
    reverse: true,
    fill: true,
  });
  const selectedQuickTypes = useMemo(
    () => QUICK_TYPES.filter((type) => quickTypes[type]),
    [quickTypes]
  );

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

  const availableCount = useMemo(() => {
    if (!selectedPackId) return 0;
    return poolEntries.filter(
      (entry) =>
        entry.packId === selectedPackId &&
        selectedQuickTypes.includes(entry.questionType)
    ).length;
  }, [poolEntries, selectedPackId, selectedQuickTypes]);

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
    setSelectedPackId(packQuery);
    setQuickTypes(parseQuickTypes(quickTypeQuery));
  }, [searchParams]);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setPacksError('Supabase is not configured. Check NEXT_PUBLIC_* environment values.');
      setPacks([]);
      setPoolEntries([]);
      return;
    }

    let cancelled = false;

    async function loadPackPool() {
      setPacksLoading(true);
      setPacksError('');

      const { data, error } = await supabase
        .from('questions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(DRILL_POOL_LIMIT);

      if (cancelled) return;

      if (error) {
        setPacksError(`Failed to load subjects: ${error.message}`);
        setPacks([]);
        setPoolEntries([]);
        setPacksLoading(false);
        return;
      }

      const nextEntries = [];
      const packMap = new Map();

      for (const question of data || []) {
        const questionType = getQuestionType(question);
        if (!QUICK_TYPES.includes(questionType)) continue;

        const { packId, packLabel } = resolveQuestionPackInfo(question);
        if (!packId) continue;

        nextEntries.push({
          question,
          packId,
          packLabel,
          questionType,
        });

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

      setPoolEntries(nextEntries);
      setPacks(nextPacks);
      setPacksLoading(false);
    }

    void loadPackPool();

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

  function toggleQuickType(type) {
    setQuickTypes((prev) => ({
      ...prev,
      [type]: !prev[type],
    }));
  }

  function buildDrillUrlParams({ packId, typesValue }) {
    const params = new URLSearchParams();
    const normalizedPackId = toText(packId);
    if (normalizedPackId) {
      params.set('pk', normalizedPackId);
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

    setLoading(true);
    setMessage('');

    const filteredEntries = poolEntries.filter(
      (entry) =>
        entry.packId === selectedPackId &&
        selectedQuickTypes.includes(entry.questionType)
    );

    const params = buildDrillUrlParams({
      packId: selectedPackId,
      typesValue: selectedQuickTypes,
    });
    const nextUrl = params.toString() ? `${pathname}?${params.toString()}` : pathname;
    router.push(nextUrl);

    if (filteredEntries.length === 0) {
      setMessage('No questions available for this subject and type filter yet.');
      setLoading(false);
      return;
    }

    const picked = shuffleArray(filteredEntries.map((entry) => entry.question)).slice(
      0,
      DRILL_MATCH_COUNT
    );
    const quickType = selectedQuickTypes.length === 1 ? selectedQuickTypes[0] : 'any';
    const label = selectedPack?.label || humanizePackId(selectedPackId) || selectedPackId;

    setActiveSessionMeta({
      codePrefix: `pack:${selectedPackId}`,
      type: quickType,
      label: buildSessionLabel(label),
      packId: selectedPackId,
    });
    setQuestions(picked);
    setStarted(true);
    setIsStartCollapsed(true);

    void trackEvent('drill_start', { codePrefix: `pack:${selectedPackId}`, type: quickType });

    if (picked.length < DRILL_MATCH_COUNT) {
      setMessage(
        `Only ${picked.length} question(s) available for ${label} with this type filter.`
      );
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
            <p className={`${helperTextClass} mt-1`}>Choose a subject, set types, and start.</p>

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
