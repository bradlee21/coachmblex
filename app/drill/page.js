'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import QuestionRunner from '../_components/QuestionRunner';
import { shuffleArray } from '../_utils/shuffleArray.mjs';
import { getSupabaseClient } from '../../src/lib/supabaseClient';
import { trackEvent } from '../../src/lib/trackEvent';

const QUICK_TYPES = ['mcq', 'reverse'];
const DRILL_MATCH_COUNT = 10;
const DRILL_PACK_LIST_LIMIT = 2000;
const DRILL_START_FETCH_LIMIT = 200;
const TEST_MATCH_COUNT_DEFAULT = 50;
const TEST_MATCH_COUNT_MIN = 5;
const TEST_MATCH_COUNT_MAX = 150;
const TEST_PACK_ID_COLUMN = 'pack_id';

function toText(value) {
  return typeof value === 'string' ? value.trim() : '';
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
    return {
      mcq: true,
      reverse: true,
    };
  }
  return parsed;
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

function toCsv(values) {
  return Array.from(new Set((values || []).filter(Boolean))).join(',');
}

function getQuestionType(question) {
  return String(question?.question_type || question?.type || '').toLowerCase();
}

function shuffleSessionQuestionChoices(question) {
  if (!question || getQuestionType(question) === 'fill') return question;
  const choices = Array.isArray(question.choices) ? question.choices : [];
  const correctIndex = Number.isInteger(question.correct_index)
    ? question.correct_index
    : Number(question.correct_index);
  if (choices.length !== 4) return question;
  if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex >= choices.length) {
    return question;
  }

  const shuffled = shuffleArray(
    choices.map((choice, originalIndex) => ({ choice, originalIndex }))
  );
  const shuffledCorrectIndex = shuffled.findIndex((item) => item.originalIndex === correctIndex);
  if (shuffledCorrectIndex < 0) return question;

  return {
    ...question,
    choices: shuffled.map((item) => item.choice),
    correct_index: shuffledCorrectIndex,
    _choicesShuffledInSession: true,
  };
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
  const packId = toText(question?.pack_id);
  const explicitDomain = toText(question?.domain);
  const packLabel = explicitDomain || humanizePackId(packId);

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

function applyDrillFilters(query, { packId, types, searchText }) {
  let next = query.eq(TEST_PACK_ID_COLUMN, toText(packId));
  const allowedTypes = (types || []).filter((type) => QUICK_TYPES.includes(type));
  next = next.in('question_type', allowedTypes.length > 0 ? allowedTypes : QUICK_TYPES);
  const orClause = buildTextSearchOrClause(searchText);
  if (orClause) {
    next = next.or(orClause);
  }
  return next;
}

function applyTestPackIdFilters(query, { packIds, types }) {
  const normalizedPackIds = Array.from(new Set((packIds || []).map((id) => toText(id)).filter(Boolean)));
  let next = query;
  if (normalizedPackIds.length > 0) {
    // Testing Center uses canonical questions.pack_id; this avoids subject/domain fallback ambiguity.
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

export default function DrillPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const questionCardRef = useRef(null);
  const testAutostartAttemptKeyRef = useRef('');

  const [packs, setPacks] = useState([]);
  const [packsLoading, setPacksLoading] = useState(false);
  const [packsError, setPacksError] = useState('');
  const [testPackIdColumnAvailable, setTestPackIdColumnAvailable] = useState(true);
  const [knownDbPackIds, setKnownDbPackIds] = useState([]);
  const [selectedPackId, setSelectedPackId] = useState('');
  const [subjectSearch, setSubjectSearch] = useState('');
  const [drillMode, setDrillMode] = useState('');
  const [testQuestionCount, setTestQuestionCount] = useState(TEST_MATCH_COUNT_DEFAULT);
  const [testPackIdsFromUrl, setTestPackIdsFromUrl] = useState([]);
  const [testRandom, setTestRandom] = useState(false);
  const [testAutostart, setTestAutostart] = useState(false);

  const [quickTypes, setQuickTypes] = useState({
    mcq: true,
    reverse: true,
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
  const isTestMode = drillMode === 'test';
  const validTestPackIds = useMemo(() => {
    const known = new Set((knownDbPackIds || []).map((id) => toText(id)).filter(Boolean));
    const requested = (testPackIdsFromUrl || []).map((id) => toText(id)).filter(Boolean);
    if (known.size === 0) return Array.from(new Set(requested));
    const filtered = requested.filter((id) => known.has(id));
    if (filtered.length > 0) return Array.from(new Set(filtered));
    return Array.from(known);
  }, [knownDbPackIds, testPackIdsFromUrl]);

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
    const mode = toText(searchParams.get('mode')).toLowerCase();
    const testN = searchParams.get('n');
    const testPacks = searchParams.get('packs');
    const testRandomValue = searchParams.get('random');
    const autostart = searchParams.get('autostart');
    setSelectedPackId(packQuery);
    setSubjectSearch(q);
    setQuickTypes(parseQuickTypes(quickTypeQuery));
    setDrillMode(mode);
    setTestQuestionCount(parseTestQuestionCount(testN));
    setTestPackIdsFromUrl(parseCsvParamList(testPacks));
    setTestRandom(parseBooleanParam(testRandomValue));
    setTestAutostart(parseBooleanParam(autostart));
  }, [searchParams]);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setPacksError('Supabase is not configured. Check NEXT_PUBLIC_* environment values.');
      setPacks([]);
      setTestPackIdColumnAvailable(false);
      return;
    }

    let cancelled = false;

    async function loadSubjects() {
      setPacksLoading(true);
      setPacksError('');

      const packIdAvailable = await detectPackIdColumnAvailability(supabase);
      if (cancelled) return;
      setTestPackIdColumnAvailable(packIdAvailable);
      if (!packIdAvailable) {
        setPacks([]);
        setPacksError('questions.pack_id column is required for Targeted Drill.');
        setPacksLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('questions')
        .select('pack_id,domain,question_type')
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
      const dbPackIds = new Set();
      for (const question of data || []) {
        const questionType = getQuestionType(question);
        if (!QUICK_TYPES.includes(questionType)) continue;
        const dbPackId = toText(question?.pack_id);
        if (dbPackId) dbPackIds.add(dbPackId);
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
      setKnownDbPackIds(Array.from(dbPackIds).sort((a, b) => a.localeCompare(b)));
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

  const testAutostartAttemptKey = useMemo(() => {
    if (!isTestMode || !testAutostart) return '';
    return JSON.stringify({
      n: testQuestionCount,
      packs: validTestPackIds,
      qt: selectedQuickTypes,
      random: testRandom,
    });
  }, [isTestMode, selectedQuickTypes, testAutostart, testQuestionCount, testRandom, validTestPackIds]);

  const refreshAvailableCount = useCallback(async () => {
    if (isTestMode) {
      if (!testPackIdColumnAvailable) {
        setAvailableCount(0);
        setCountMessage(
          'Custom test pack filtering requires questions.pack_id. Run the pack_id SQL migration/backfill and re-import packs.'
        );
        setCountLoading(false);
        return;
      }
      if (knownDbPackIds.length === 0) {
        setAvailableCount(0);
        setCountMessage(
          'No questions.pack_id values found yet. Run the pack_id backfill SQL or re-import packs before using Testing Center.'
        );
        setCountLoading(false);
        return;
      }
      if (validTestPackIds.length === 0) {
        setAvailableCount(0);
        setCountMessage('No valid test packs selected. Return to Testing Center and select packs.');
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

      const { count, error } = await applyTestPackIdFilters(
        supabase.from('questions').select('id', { head: true, count: 'exact' }),
        {
          packIds: validTestPackIds,
          types: selectedQuickTypes,
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
      return;
    }

    if (!selectedPackId) {
      setAvailableCount(0);
      setCountMessage('');
      setCountLoading(false);
      return;
    }
    if (!testPackIdColumnAvailable) {
      setAvailableCount(0);
      setCountMessage(
        packsError ? '' : 'Targeted Drill requires questions.pack_id. Run the pack_id SQL migration/backfill and re-import packs.'
      );
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
  }, [
    isTestMode,
    selectedPackId,
    selectedQuickTypes,
    subjectSearch,
    testPackIdColumnAvailable,
    knownDbPackIds,
    validTestPackIds,
  ]);

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
    const requestedCount = isTestMode ? testQuestionCount : DRILL_MATCH_COUNT;

    if (isTestMode) {
      if (selectedQuickTypes.length === 0) {
        setMessage('Pick at least one type.');
        return;
      }
      if (!testPackIdColumnAvailable) {
        setMessage(
          'Custom test pack filtering requires questions.pack_id. Run the pack_id SQL migration/backfill and re-import packs.'
        );
        return;
      }
      if (knownDbPackIds.length === 0) {
        setMessage(
          'No questions.pack_id values found yet. Run the pack_id backfill SQL or re-import packs before using Testing Center.'
        );
        return;
      }
      if (validTestPackIds.length === 0) {
        setMessage('No valid test packs selected. Return to Testing Center and choose packs.');
        return;
      }

      const supabase = getSupabaseClient();
      if (!supabase) {
        setMessage('Supabase is not configured. Check NEXT_PUBLIC_* environment values.');
        return;
      }

      setLoading(true);
      setMessage('');

      const params = new URLSearchParams();
      params.set('mode', 'test');
      params.set('n', String(testQuestionCount));
      params.set('packs', validTestPackIds.join(','));
      if (selectedQuickTypes.length !== QUICK_TYPES.length) {
        params.set('qt', toCsv(selectedQuickTypes));
      }
      if (testRandom) {
        params.set('random', '1');
      }
      router.push(`${pathname}?${params.toString()}`);

      const fetchLimit = Math.max(DRILL_START_FETCH_LIMIT, requestedCount);
      const { data, error } = await applyTestPackIdFilters(
        supabase
          .from('questions')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(fetchLimit),
        {
          packIds: validTestPackIds,
          types: selectedQuickTypes,
        }
      );

      if (error) {
        setMessage(`Failed to load drill questions: ${error.message}`);
        setLoading(false);
        return;
      }

      const pool = Array.isArray(data) ? data : [];
      const picked = (testRandom ? shuffleArray(pool) : pool).slice(0, requestedCount);
      const sessionQuestions = picked.map(shuffleSessionQuestionChoices);
      if (sessionQuestions.length === 0) {
        setMessage('No questions available for the selected test packs.');
        setLoading(false);
        return;
      }

      const quickType = selectedQuickTypes.length === 1 ? selectedQuickTypes[0] : 'any';
      setActiveSessionMeta({
        codePrefix: 'test',
        type: quickType,
        label: `Custom Test (${validTestPackIds.length} pack${validTestPackIds.length === 1 ? '' : 's'})`,
        packId: validTestPackIds.join(','),
      });
      setQuestions(sessionQuestions);
      setStarted(true);
      setIsStartCollapsed(true);

      void trackEvent('drill_start', { codePrefix: 'test', type: quickType });

      if (sessionQuestions.length < requestedCount) {
        setMessage(
          `Only ${sessionQuestions.length} question(s) available across ${validTestPackIds.length} selected pack(s).`
        );
      }

      setLoading(false);
      return;
    }

    if (!selectedPackId) {
      setMessage('Choose a subject to start.');
      return;
    }
    if (selectedQuickTypes.length === 0) {
      setMessage('Pick at least one type.');
      return;
    }
    if (!testPackIdColumnAvailable) {
      setMessage(
        'Targeted Drill requires questions.pack_id. Run the pack_id SQL migration/backfill and re-import packs.'
      );
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
    const sessionQuestions = picked.map(shuffleSessionQuestionChoices);
    if (sessionQuestions.length === 0) {
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
    setQuestions(sessionQuestions);
    setStarted(true);
    setIsStartCollapsed(true);

    void trackEvent('drill_start', { codePrefix: `pack:${selectedPackId}`, type: quickType });

    if (sessionQuestions.length < DRILL_MATCH_COUNT) {
      setMessage(`Only ${sessionQuestions.length} question(s) available for ${label} with this filter.`);
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
  const testAutostartPending = isTestMode && testAutostart && !started;

  useEffect(() => {
    if (!testAutostartPending) return;
    if (packsLoading || loading) return;
    if (!testAutostartAttemptKey) return;
    if (testAutostartAttemptKeyRef.current === testAutostartAttemptKey) return;

    testAutostartAttemptKeyRef.current = testAutostartAttemptKey;
    void startPackDrill();
  }, [loading, packsLoading, startPackDrill, testAutostartAttemptKey, testAutostartPending]);

  return (
    <section className="mx-auto w-full max-w-6xl px-4 pb-10 pt-6 sm:px-6 lg:px-8">
      <div className="mb-6 space-y-2">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Drill</h1>
        <p className={helperTextClass}>
          {isTestMode
            ? `Custom Test: ${testQuestionCount} question(s) across ${validTestPackIds.length || 0} selected pack(s).`
            : `Pick a subject and start a ${DRILL_MATCH_COUNT}-question drill.`}
        </p>
      </div>

      <div className="mx-auto w-full max-w-4xl space-y-4">
        {started && isStartCollapsed ? (
          <div className={`${cardClass} flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between`}>
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Drill in progress</p>
              <p className={helperTextClass}>
                {activeSessionMeta.label || (isTestMode ? 'Custom Test' : 'Subject drill')} |{' '}
                {formatTypesLabel(selectedQuickTypes)} |{' '}
                {questions.length || (isTestMode ? testQuestionCount : DRILL_MATCH_COUNT)}/
                {isTestMode ? testQuestionCount : DRILL_MATCH_COUNT} questions
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
        ) : testAutostartPending ? (
          <div className={cardClass}>
            <h2 className={sectionTitleClass}>Starting Custom Test...</h2>
            <p className={`${helperTextClass} mt-1`}>
              Preparing {testQuestionCount} question(s) across {validTestPackIds.length || 0} selected pack(s).
            </p>
            {loading || packsLoading || countLoading ? (
              <p className={`${helperTextClass} mt-3`}>Loading questions...</p>
            ) : null}
            {message ? (
              <div className="mt-3 space-y-2">
                <p className="status error">{message}</p>
                <Link href="/test" className={subtleButtonClass}>
                  Back to Testing Center
                </Link>
              </div>
            ) : null}
          </div>
        ) : (
          <div className={cardClass}>
            <h2 className={sectionTitleClass}>Start Drill</h2>
            <p className={`${helperTextClass} mt-1`}>
              {isTestMode
                ? `Custom Test mode from Testing Center (${testQuestionCount} questions, ${validTestPackIds.length || 0} pack(s)).`
                : 'Choose a subject, optionally search within it, then start.'}
            </p>

            <div className="mt-4 space-y-3">
              {!isTestMode ? (
                <>
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
                </>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800/50">
                  <p className="text-slate-700 dark:text-slate-200">
                    Selected packs: <strong>{validTestPackIds.length || 0}</strong>
                  </p>
                  <p className="text-slate-600 dark:text-slate-300">
                    Target count: <strong>{testQuestionCount}</strong>
                  </p>
                  <p className="text-slate-600 dark:text-slate-300">
                    Random: <strong>{testRandom ? 'On' : 'Off'}</strong>
                  </p>
                </div>
              )}

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
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800/50">
                <p className="text-slate-700 dark:text-slate-200">
                  Available questions:{' '}
                  <strong>{isTestMode ? availableCount : selectedPackId ? availableCount : 0}</strong>
                </p>
                <p className="text-slate-600 dark:text-slate-300">
                  Count: <strong>{isTestMode ? testQuestionCount : DRILL_MATCH_COUNT}</strong>
                </p>
              </div>

              {countLoading ? <p className={helperTextClass}>Checking available questions...</p> : null}
              {countMessage ? <p className="status error">{countMessage}</p> : null}

              <div>
                <button
                  className={buttonClass}
                  type="button"
                  onClick={() => void startPackDrill()}
                  disabled={
                    loading ||
                    packsLoading ||
                    (!isTestMode && !selectedPackId) ||
                    (isTestMode &&
                      (!testPackIdColumnAvailable ||
                        knownDbPackIds.length === 0 ||
                        validTestPackIds.length === 0))
                  }
                >
                  {loading ? 'Loading...' : isTestMode ? 'Start Test' : 'Start Drill'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {message && !testAutostartPending ? <p className="status error mt-4">{message}</p> : null}

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
