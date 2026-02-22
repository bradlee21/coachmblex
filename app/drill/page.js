'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import QuestionRunner from '../_components/QuestionRunner';
import { shuffleArray } from '../_components/questionRunnerLogic.mjs';
import { getSupabaseClient } from '../../src/lib/supabaseClient';
import { trackEvent } from '../../src/lib/trackEvent';
import {
  findNodeByCode,
  listTopLevelDomains,
  mblexBlueprint,
} from '../../src/content/mblexBlueprint';

function gatherLeafNodes(node, leafNodes = []) {
  if (!node.children?.length) {
    leafNodes.push(node);
    return leafNodes;
  }

  for (const child of node.children) {
    gatherLeafNodes(child, leafNodes);
  }

  return leafNodes;
}

function getCodePrefix(code) {
  const parts = String(code || '')
    .split('.')
    .filter(Boolean);
  if (parts.length >= 2) return `${parts[0]}.${parts[1]}`;
  return parts[0] || '';
}

function getBlueprintSectionCode(code) {
  const parts = String(code || '')
    .split('.')
    .filter(Boolean);
  return parts[0] || '';
}

function getBlueprintSubsectionCode(code) {
  const parts = String(code || '')
    .split('.')
    .filter(Boolean);
  if (parts.length >= 2) return `${parts[0]}.${parts[1]}`;
  return '';
}

function getBlueprintLabel(code) {
  if (!code) return '(unknown)';
  const node = findNodeByCode(code);
  if (!node) return code;
  return `${node.code} ${node.title}`;
}

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

function matchesQuickSearch(question, term) {
  if (!term) return true;
  const prompt = String(question?.prompt || '');
  const tagText = Array.isArray(question?.tags) ? question.tags.join(' ') : '';
  let choiceText = '';
  if (Array.isArray(question?.choices)) {
    choiceText = question.choices.join(' ');
  } else if (question?.choices && typeof question.choices === 'object') {
    choiceText = Object.values(question.choices).join(' ');
  }
  const haystack = `${prompt} ${tagText} ${choiceText}`.toLowerCase();
  return haystack.includes(term);
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

function getPackId(row) {
  if (row?.pack_id) return String(row.pack_id);
  if (row?.packId) return String(row.packId);

  const sourceObject = parseMaybeObject(row?.source);
  if (sourceObject?.pack_id) return String(sourceObject.pack_id);
  if (sourceObject?.packId) return String(sourceObject.packId);

  const metadataObject = parseMaybeObject(row?.metadata);
  if (metadataObject?.pack_id) return String(metadataObject.pack_id);
  if (metadataObject?.packId) return String(metadataObject.packId);

  return 'unknown';
}

export default function DrillPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const quickSearchRequestIdRef = useRef(0);
  const questionCardRef = useRef(null);
  const topLevel = listTopLevelDomains();
  const [sectionCode, setSectionCode] = useState(topLevel[0]?.code || '');

  const sectionNode = useMemo(
    () => mblexBlueprint.sections.find((section) => section.code === sectionCode) || null,
    [sectionCode]
  );
  const subsectionOptions = sectionNode?.children || [];
  const [subsectionCode, setSubsectionCode] = useState(subsectionOptions[0]?.code || '');

  const selectedSubsection = useMemo(
    () => findNodeByCode(subsectionCode),
    [subsectionCode]
  );
  const leafOptions = useMemo(() => {
    if (!selectedSubsection) return [];
    return gatherLeafNodes(selectedSubsection).filter(
      (node) => node.code !== selectedSubsection.code
    );
  }, [selectedSubsection]);
  const [leafCode, setLeafCode] = useState('');

  const selectedCode = leafCode || subsectionCode || sectionCode;
  const selectedNode = findNodeByCode(selectedCode);
  const [questionType, setQuestionType] = useState('mcq');
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
  const [quickQuestions, setQuickQuestions] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [started, setStarted] = useState(false);
  const [isStartCollapsed, setIsStartCollapsed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [activeSessionMeta, setActiveSessionMeta] = useState({ codePrefix: '', type: 'mcq' });
  const [diagnosticLoading, setDiagnosticLoading] = useState(false);
  const [diagnosticError, setDiagnosticError] = useState('');
  const [diagnosticTotal, setDiagnosticTotal] = useState(null);
  const [diagnosticSampleKeys, setDiagnosticSampleKeys] = useState('');
  const [diagnosticPackGroups, setDiagnosticPackGroups] = useState([]);
  const [diagnosticBlueprintGroups, setDiagnosticBlueprintGroups] = useState([]);
  const [diagnosticPackTotalSum, setDiagnosticPackTotalSum] = useState(0);
  const supabaseHostname = useMemo(() => {
    const raw = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    if (!raw) return '(missing NEXT_PUBLIC_SUPABASE_URL)';
    try {
      const normalized = raw.startsWith('http') ? raw : `https://${raw}`;
      return new URL(normalized).hostname;
    } catch {
      return '(invalid NEXT_PUBLIC_SUPABASE_URL)';
    }
  }, []);

  const handleDrillComplete = useCallback(
    ({ score, total }) => {
      void trackEvent('drill_complete', {
        codePrefix: activeSessionMeta.codePrefix || getCodePrefix(selectedCode),
        type: activeSessionMeta.type || questionType,
        correct: Number(score) || 0,
        total: Number(total) || 0,
      });
    },
    [activeSessionMeta.codePrefix, activeSessionMeta.type, questionType, selectedCode]
  );

  function onSelectSection(nextSectionCode) {
    setSectionCode(nextSectionCode);
    const nextSection = mblexBlueprint.sections.find(
      (section) => section.code === nextSectionCode
    );
    const nextSubsection = nextSection?.children?.[0]?.code || '';
    setSubsectionCode(nextSubsection);
    setLeafCode('');
  }

  function onSelectSubsection(nextSubsectionCode) {
    setSubsectionCode(nextSubsectionCode);
    setLeafCode('');
  }

  useEffect(() => {
    const deepLinkCode = searchParams.get('code');
    const deepLinkType = searchParams.get('type');
    const quickQuery = searchParams.get('q') || '';
    const quickTypeQuery = searchParams.get('qt');
    setQuickSearch(quickQuery);
    setQuickTypes(parseQuickTypes(quickTypeQuery));
    if (deepLinkType === 'reverse') {
      setQuestionType('reverse');
    } else if (deepLinkType === 'fill') {
      setQuestionType('fill');
    } else if (deepLinkType === 'mcq') {
      setQuestionType('mcq');
    }
    if (!deepLinkCode) return;
    const node = findNodeByCode(deepLinkCode);
    if (!node) return;

    const deepSection = deepLinkCode.split('.')[0];
    const nextSection =
      mblexBlueprint.sections.find((section) => section.code === deepSection) || null;
    if (!nextSection) return;

    const nextSubsection =
      nextSection.children.find(
        (child) => deepLinkCode === child.code || deepLinkCode.startsWith(`${child.code}.`)
      ) || nextSection.children[0];

    setSectionCode(nextSection.code);
    setSubsectionCode(nextSubsection?.code || '');
    if (deepLinkCode === nextSection.code || deepLinkCode === nextSubsection?.code) {
      setLeafCode('');
    } else {
      setLeafCode(deepLinkCode);
    }
  }, [searchParams]);

  const loadDiagnostics = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setDiagnosticError('Supabase is not configured. Check NEXT_PUBLIC_* environment values.');
      setDiagnosticTotal(0);
      setDiagnosticSampleKeys('');
      setDiagnosticPackGroups([]);
      setDiagnosticBlueprintGroups([]);
      setDiagnosticPackTotalSum(0);
      return;
    }

    setDiagnosticLoading(true);
    setDiagnosticError('');

    const { count, error } = await supabase
      .from('questions')
      .select('id', { head: true, count: 'exact' });

    if (error) {
      setDiagnosticError(`Failed to load question count: ${error.message}`);
      setDiagnosticTotal(0);
      setDiagnosticSampleKeys('');
      setDiagnosticPackGroups([]);
      setDiagnosticBlueprintGroups([]);
      setDiagnosticPackTotalSum(0);
      setDiagnosticLoading(false);
      return;
    }

    setDiagnosticTotal(count ?? 0);

    const { data: sampleRows, error: sampleError } = await supabase
      .from('questions')
      .select('*')
      .limit(1);

    if (sampleError) {
      setDiagnosticError(`Failed to load sample row keys: ${sampleError.message}`);
      setDiagnosticSampleKeys('');
      setDiagnosticPackGroups([]);
      setDiagnosticBlueprintGroups([]);
      setDiagnosticPackTotalSum(0);
      setDiagnosticLoading(false);
      return;
    }

    const sampleRow = Array.isArray(sampleRows) && sampleRows.length > 0 ? sampleRows[0] : null;
    setDiagnosticSampleKeys(sampleRow ? Object.keys(sampleRow).join(', ') : '(no rows)');

    const pageSize = 1000;
    let from = 0;
    const rows = [];
    for (;;) {
      const { data: pageRows, error: pageError } = await supabase
        .from('questions')
        .select('*')
        .order('id', { ascending: true })
        .range(from, from + pageSize - 1);

      if (pageError) {
        setDiagnosticError(`Could not load grouped counts: ${pageError.message}`);
        setDiagnosticPackGroups([]);
        setDiagnosticBlueprintGroups([]);
        setDiagnosticPackTotalSum(0);
        setDiagnosticLoading(false);
        return;
      }

      const data = pageRows || [];
      if (data.length === 0) break;
      rows.push(...data);
      if (data.length < pageSize) break;
      from += data.length;
    }

    const packCounts = new Map();
    const blueprintCounts = new Map();

    for (const row of rows) {
      const packId = getPackId(row);
      packCounts.set(packId, (packCounts.get(packId) || 0) + 1);

      const subsectionCode = getBlueprintSubsectionCode(row?.blueprint_code);
      const subsectionLabel = getBlueprintLabel(subsectionCode || '(none)');
      blueprintCounts.set(subsectionLabel, (blueprintCounts.get(subsectionLabel) || 0) + 1);
    }

    const packGroups = Array.from(packCounts.entries())
      .map(([value, valueCount]) => ({ value, count: valueCount }))
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));

    const blueprintGroups = Array.from(blueprintCounts.entries())
      .map(([value, valueCount]) => ({ value, count: valueCount }))
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));

    setDiagnosticPackGroups(packGroups);
    setDiagnosticBlueprintGroups(blueprintGroups);
    setDiagnosticPackTotalSum(packGroups.reduce((sum, item) => sum + item.count, 0));
    setDiagnosticError('');
    setDiagnosticLoading(false);
  }, []);

  useEffect(() => {
    void loadDiagnostics();
  }, [loadDiagnostics]);

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
        error: `Failed to load quick drill matches: ${error.message}`,
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
      setQuickQuestions([]);
      setQuickMessage(error);
      setQuickLoading(false);
      return;
    }

    const filtered = matches || [];
    setQuickQuestions(filtered);
    setQuickMatches(filtered.length);
    if (filtered.length === 0) {
      setQuickMessage('No matches. Try a broader term.');
    } else {
      setQuickMessage('');
    }
    setQuickLoading(false);
  }, [fetchQuickMatches, quickSearch, selectedQuickTypes]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void refreshQuickMatches();
    }, 200);
    return () => clearTimeout(timer);
  }, [refreshQuickMatches]);

  async function startDrill() {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setMessage('Supabase is not configured. Check NEXT_PUBLIC_* environment values.');
      return;
    }

    const query = supabase
      .from('questions')
      .select('*')
      .eq('question_type', questionType)
      .order('created_at', { ascending: false })
      .limit(60);

    if (leafCode) {
      query.eq('blueprint_code', leafCode);
    } else if (subsectionCode) {
      query.like('blueprint_code', `${subsectionCode}%`);
    } else {
      query.like('blueprint_code', `${sectionCode}.%`);
    }

    setLoading(true);
    setMessage('');

    const { data, error } = await query;
    if (error) {
      setMessage(`Failed to load drill questions: ${error.message}`);
      setLoading(false);
      return;
    }

    const picked = shuffleArray(data || []).slice(0, DRILL_MATCH_COUNT);
    const codePrefix = getCodePrefix(selectedCode);
    const type = ['mcq', 'reverse', 'fill'].includes(questionType) ? questionType : 'mcq';
    setActiveSessionMeta({ codePrefix, type });
    setQuestions(picked);
    setStarted(true);
    setIsStartCollapsed(true);
    void trackEvent('drill_start', { codePrefix, type });
    if (picked.length < DRILL_MATCH_COUNT) {
      setMessage(
        `Only ${picked.length} ${questionType.toUpperCase()} question(s) found for ${selectedTopicLabel}. Add more tagged content to reach ${DRILL_MATCH_COUNT}.`
      );
    }
    setLoading(false);
  }

  function toggleQuickType(type) {
    setQuickTypes((prev) => ({
      ...prev,
      [type]: !prev[type],
    }));
  }

  function buildQuickUrlParams({ searchValue, typesValue }) {
    const params = new URLSearchParams(searchParams.toString());
    const trimmedSearch = String(searchValue || '').trim();
    if (trimmedSearch) {
      params.set('q', trimmedSearch);
    } else {
      params.delete('q');
    }
    const typesCsv = toCsv(typesValue);
    if (typesCsv) {
      params.set('qt', typesCsv);
    } else {
      params.delete('qt');
    }
    params.delete('bc');
    params.delete('tg');
    params.delete('cid');
    params.set('quick', '1');
    return params;
  }

  async function startQuickDrillWithFilters({ searchValue, typesValue }) {
    if (!typesValue || typesValue.length === 0) {
      setQuickMessage('Pick at least one type.');
      return;
    }
    setQuickLoading(true);
    const { matches, error } = await fetchQuickMatches({
      searchTerm: searchValue,
      types: typesValue,
    });
    if (error) {
      setQuickMessage(error);
      setQuickMatches(0);
      setQuickQuestions([]);
      setQuickLoading(false);
      return;
    }
    const filtered = matches || [];
    setQuickQuestions(filtered);
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
    router.push(`${pathname}?${params.toString()}`);

    const picked = shuffleArray(filtered).slice(0, DRILL_MATCH_COUNT);
    const quickType = typesValue.length === 1 ? typesValue[0] : 'any';
    const quickPrefix = searchValue?.trim() ? `search:${searchValue.trim()}` : 'quick';
    setActiveSessionMeta({ codePrefix: quickPrefix, type: quickType });
    setQuestions(picked);
    setStarted(true);
    setIsStartCollapsed(true);
    void trackEvent('drill_start', { codePrefix: quickPrefix, type: quickType });
    if (picked.length < DRILL_MATCH_COUNT) {
      setMessage(
        `Only ${picked.length} question(s) match this quick drill filter. Try a broader term or more types.`
      );
    } else {
      setMessage('');
    }
    setQuickLoading(false);
  }

  function startQuickDrill() {
    void startQuickDrillWithFilters({
      searchValue: quickSearch,
      typesValue: selectedQuickTypes,
    });
  }

  const sectionLabel = getBlueprintLabel(getBlueprintSectionCode(selectedCode) || sectionCode);
  const subsectionLabel = getBlueprintLabel(
    getBlueprintSubsectionCode(selectedCode) || subsectionCode
  );
  const leafLabel = leafCode ? getBlueprintLabel(leafCode) : 'Using subsection scope';
  const selectedTopicLabel = selectedNode
    ? `${selectedNode.code} ${selectedNode.title}`
    : getBlueprintLabel(selectedCode);
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
        <p className={helperTextClass}>Pick a blueprint topic and start a focused {DRILL_MATCH_COUNT}-question drill.</p>
      </div>

      <div className="mx-auto w-full max-w-4xl space-y-4">
        {started && isStartCollapsed ? (
          <div className={`${cardClass} flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between`}>
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Drill in progress
              </p>
              <p className={helperTextClass}>
                {selectedTopicLabel} | {(activeSessionMeta.type || questionType).toUpperCase()} | {questions.length || DRILL_MATCH_COUNT}/{DRILL_MATCH_COUNT} questions
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
          <>
            <div className={cardClass}>
              <h2 className={sectionTitleClass}>Start Drill</h2>
              <p className={`${helperTextClass} mt-1`}>
                Simple gauntlet: pick a topic, choose one question type, and begin.
              </p>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className={labelClass} htmlFor="drill-section">
                    Section
                  </label>
                  <select
                    id="drill-section"
                    className={inputClass}
                    value={sectionCode}
                    onChange={(event) => onSelectSection(event.target.value)}
                  >
                    {topLevel.map((section) => (
                      <option key={section.code} value={section.code}>
                        {section.code}. {section.title}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className={labelClass} htmlFor="drill-subsection">
                    Subsection
                  </label>
                  <select
                    id="drill-subsection"
                    className={inputClass}
                    value={subsectionCode}
                    onChange={(event) => onSelectSubsection(event.target.value)}
                  >
                    {subsectionOptions.map((node) => (
                      <option key={node.code} value={node.code}>
                        {node.code} {node.title}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <label className={labelClass} htmlFor="drill-leaf">
                    Leaf (optional)
                  </label>
                  <select
                    id="drill-leaf"
                    className={inputClass}
                    value={leafCode}
                    onChange={(event) => setLeafCode(event.target.value)}
                  >
                    <option value="">Use subsection ({subsectionCode})</option>
                    {leafOptions.map((node) => (
                      <option key={node.code} value={node.code}>
                        {node.code} {node.title}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mt-4 space-y-2">
                <span className={labelClass}>Question type</span>
                <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Question type">
                  {['mcq', 'reverse', 'fill'].map((type) => {
                    const selected = questionType === type;
                    return (
                      <button
                        key={type}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        className={
                          selected
                            ? `${subtleButtonClass} border-slate-800 bg-slate-100 text-slate-900 dark:border-slate-300 dark:bg-slate-800 dark:text-slate-100`
                            : subtleButtonClass
                        }
                        onClick={() => setQuestionType(type)}
                      >
                        {type === 'mcq' ? 'MCQ' : type === 'reverse' ? 'Reverse' : 'Fill'}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                <div className="space-y-1.5">
                  <label className={labelClass} htmlFor="drill-match-count">
                    Match count
                  </label>
                  <input
                    id="drill-match-count"
                    className={inputClass}
                    type="text"
                    value={`${DRILL_MATCH_COUNT} questions`}
                    readOnly
                    aria-readonly="true"
                  />
                </div>
                <button
                  className={buttonClass}
                  type="button"
                  onClick={startDrill}
                  disabled={loading || !selectedCode}
                >
                  {loading ? 'Loading...' : 'Start Drill'}
                </button>
              </div>

              <p className="mt-3 text-sm text-slate-700 dark:text-slate-200">
                Topic: <strong>{selectedTopicLabel}</strong>
              </p>
            </div>

            <details className={cardClass}>
              <summary className="cursor-pointer text-base font-semibold text-slate-900 dark:text-slate-100">
                Advanced: Quick search drill
              </summary>
              <div className="mt-3 space-y-3">
                <div className="space-y-1.5">
                  <label className={labelClass} htmlFor="drill-quick-search">
                    Search content
                  </label>
                  <input
                    id="drill-quick-search"
                    className={inputClass}
                    type="text"
                    placeholder="e.g., piriformis, sympathetic, blood flow"
                    value={quickSearch}
                    onChange={(event) => setQuickSearch(event.target.value)}
                  />
                </div>
                <div className="space-y-1.5" role="group" aria-label="Quick Drill type filters">
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
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Matches: {quickMatches == null ? '...' : quickMatches}
                </p>
                {quickLoading ? <p className={helperTextClass}>Checking matches...</p> : null}
                {quickMessage ? <p className="status error">{quickMessage}</p> : null}
                <div>
                  <button
                    className={buttonClass}
                    type="button"
                    onClick={startQuickDrill}
                    disabled={quickLoading}
                  >
                    Start Quick Drill
                  </button>
                </div>
              </div>
            </details>

            <details className={cardClass}>
              <summary className="cursor-pointer text-base font-semibold text-slate-900 dark:text-slate-100">
                Advanced: Blueprint drill details
              </summary>
              <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-700 dark:bg-slate-800/50">
                <p className="text-slate-700 dark:text-slate-200">
                  Selected blueprint code: <strong>{selectedCode || 'none'}</strong>
                </p>
                <p className="text-slate-700 dark:text-slate-200">
                  Section: <strong>{sectionLabel}</strong>
                </p>
                <p className="text-slate-700 dark:text-slate-200">
                  Subsection: <strong>{subsectionLabel}</strong>
                </p>
                <p className="text-slate-700 dark:text-slate-200">
                  Leaf: <strong>{leafLabel}</strong>
                </p>
                <p className="text-slate-700 dark:text-slate-200">Selected topic: {selectedTopicLabel}</p>
                <p className={`${helperTextClass} mt-1`}>
                  Drill filters by blueprint code: leaf exact match, subsection prefix, section prefix.
                </p>
              </div>
            </details>

            <details className={cardClass}>
              <summary className="cursor-pointer text-base font-semibold text-slate-900 dark:text-slate-100">
                Diagnostics
              </summary>
              <div className="mt-3 space-y-2 text-sm text-slate-700 dark:text-slate-200">
                <p>
                  Connected Supabase hostname: <strong>{supabaseHostname}</strong>
                </p>
                <p>
                  Total questions in DB:{' '}
                  <strong>{diagnosticTotal == null ? '...' : String(diagnosticTotal)}</strong>
                </p>
                <p>
                  Sample row keys: <strong>{diagnosticSampleKeys || '...'}</strong>
                </p>
                <p>
                  Counts grouped by <strong>pack</strong>
                </p>
                <p>
                  Pack totals sum: <strong>{diagnosticPackTotalSum}</strong>
                </p>
                {diagnosticPackGroups.length > 0 ? (
                  <ul className="list-disc pl-5">
                    {diagnosticPackGroups.map((item) => (
                      <li key={`pack-${item.value}-${item.count}`}>
                        {item.value}: {item.count}
                      </li>
                    ))}
                  </ul>
                ) : null}
                <p>
                  Counts grouped by <strong>blueprint subsection</strong>
                </p>
                {diagnosticBlueprintGroups.length > 0 ? (
                  <ul className="list-disc pl-5">
                    {diagnosticBlueprintGroups.map((item) => (
                      <li key={`blueprint-${item.value}-${item.count}`}>
                        {item.value}: {item.count}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {diagnosticError ? <p className="status error">{diagnosticError}</p> : null}
                {diagnosticLoading ? <p className={helperTextClass}>Loading diagnostics...</p> : null}
                <div>
                  <button
                    className={subtleButtonClass}
                    type="button"
                    onClick={() => void loadDiagnostics()}
                    disabled={diagnosticLoading}
                  >
                    Refresh diagnostics
                  </button>
                </div>
              </div>
            </details>
          </>
        )}
      </div>

      {message ? <p className="status error mt-4">{message}</p> : null}
      {started ? (
        <div ref={questionCardRef} className="mx-auto mt-6 w-full max-w-5xl scroll-mt-6">
          <QuestionRunner
            title={`Drill ${selectedTopicLabel}`}
            questions={questions}
            onComplete={handleDrillComplete}
          />
        </div>
      ) : null}
    </section>
  );
}

