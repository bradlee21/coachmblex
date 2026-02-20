'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import QuestionRunner from '../_components/QuestionRunner';
import { getSupabaseClient } from '../../src/lib/supabaseClient';
import { trackEvent } from '../../src/lib/trackEvent';
import { studyCollections } from '../../src/content/studyCollections';
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

const QUICK_TYPES = ['mcq', 'reverse', 'fill'];
const QUICK_PARAM_KEYS = ['quick', 'q', 'qt', 'bc', 'tg', 'cid'];

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

function parseCsv(value) {
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

function getQuestionTags(question) {
  if (Array.isArray(question?.tags)) {
    return question.tags
      .map((item) => String(item || '').trim().toLowerCase())
      .filter(Boolean);
  }
  if (typeof question?.tags === 'string') {
    return parseCsv(question.tags).map((item) => item.toLowerCase());
  }
  return [];
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
  const [quickBlueprintCodes, setQuickBlueprintCodes] = useState([]);
  const [quickTags, setQuickTags] = useState([]);
  const [selectedCollectionId, setSelectedCollectionId] = useState('');
  const selectedQuickTypes = useMemo(
    () => QUICK_TYPES.filter((type) => quickTypes[type]),
    [quickTypes]
  );
  const selectedCollection = useMemo(
    () => studyCollections.find((collection) => collection.id === selectedCollectionId) || null,
    [selectedCollectionId]
  );
  const [quickMatches, setQuickMatches] = useState(null);
  const [quickLoading, setQuickLoading] = useState(false);
  const [quickMessage, setQuickMessage] = useState('');
  const [quickQuestions, setQuickQuestions] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [started, setStarted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [activeSessionMeta, setActiveSessionMeta] = useState({ codePrefix: '', type: 'mcq' });
  const [diagnosticLoading, setDiagnosticLoading] = useState(false);
  const [diagnosticError, setDiagnosticError] = useState('');
  const [diagnosticTotal, setDiagnosticTotal] = useState(null);
  const [diagnosticSampleKeys, setDiagnosticSampleKeys] = useState('');
  const [diagnosticPackGroups, setDiagnosticPackGroups] = useState([]);
  const [diagnosticSubtopicGroups, setDiagnosticSubtopicGroups] = useState([]);
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
    const quickBlueprintCodeQuery = searchParams.get('bc');
    const quickTagQuery = searchParams.get('tg');
    const quickCollectionIdQuery = searchParams.get('cid') || '';
    setQuickSearch(quickQuery);
    setQuickTypes(parseQuickTypes(quickTypeQuery));
    setQuickBlueprintCodes(parseCsv(quickBlueprintCodeQuery));
    setQuickTags(parseCsv(quickTagQuery).map((item) => item.toLowerCase()));
    setSelectedCollectionId(quickCollectionIdQuery);
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
      setDiagnosticSubtopicGroups([]);
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
      setDiagnosticSubtopicGroups([]);
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
      setDiagnosticSubtopicGroups([]);
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
        setDiagnosticSubtopicGroups([]);
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
    const subtopicCounts = new Map();

    for (const row of rows) {
      const packId = getPackId(row);
      packCounts.set(packId, (packCounts.get(packId) || 0) + 1);

      const subtopic = row?.subtopic ? String(row.subtopic) : '(none)';
      subtopicCounts.set(subtopic, (subtopicCounts.get(subtopic) || 0) + 1);
    }

    const packGroups = Array.from(packCounts.entries())
      .map(([value, valueCount]) => ({ value, count: valueCount }))
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));

    const subtopicGroups = Array.from(subtopicCounts.entries())
      .map(([value, valueCount]) => ({ value, count: valueCount }))
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));

    setDiagnosticPackGroups(packGroups);
    setDiagnosticSubtopicGroups(subtopicGroups);
    setDiagnosticPackTotalSum(packGroups.reduce((sum, item) => sum + item.count, 0));
    setDiagnosticError('');
    setDiagnosticLoading(false);
  }, []);

  useEffect(() => {
    void loadDiagnostics();
  }, [loadDiagnostics]);

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
      .select(
        'id,domain,subtopic,blueprint_code,question_type,prompt,choices,correct_index,explanation,difficulty,created_at'
      )
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
    const blueprintCodes = filters.blueprintCodes || [];
    const tags = (filters.tags || []).map((item) => String(item || '').trim().toLowerCase());
    const filtered = (data || []).filter((question) => {
      if (!types.includes(getQuestionType(question))) return false;
      if (blueprintCodes.length > 0 && !blueprintCodes.includes(String(question?.blueprint_code || ''))) {
        return false;
      }
      if (tags.length > 0 && Object.prototype.hasOwnProperty.call(question, 'tags')) {
        const questionTags = getQuestionTags(question);
        if (!questionTags.some((tag) => tags.includes(tag))) {
          return false;
        }
      }
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
      blueprintCodes: quickBlueprintCodes,
      tags: quickTags,
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
  }, [fetchQuickMatches, quickSearch, quickBlueprintCodes, quickTags, selectedQuickTypes]);

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
      .select(
        'id,domain,subtopic,blueprint_code,question_type,prompt,choices,correct_index,explanation,difficulty,created_at'
      )
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

    const picked = (data || []).slice(0, 10);
    const codePrefix = getCodePrefix(selectedCode);
    const type = ['mcq', 'reverse', 'fill'].includes(questionType) ? questionType : 'mcq';
    setActiveSessionMeta({ codePrefix, type });
    setQuestions(picked);
    setStarted(true);
    void trackEvent('drill_start', { codePrefix, type });
    if (picked.length < 10) {
      setMessage(
        `Only ${picked.length} ${questionType.toUpperCase()} question(s) found for ${selectedCode}. Add more tagged content to reach 10.`
      );
    }
    setLoading(false);
  }

  function toggleQuickType(type) {
    setSelectedCollectionId('');
    setQuickTypes((prev) => ({
      ...prev,
      [type]: !prev[type],
    }));
  }

  function buildQuickUrlParams({
    searchValue,
    typesValue,
    blueprintCodesValue,
    tagsValue,
    collectionIdValue,
  }) {
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
    const blueprintCsv = toCsv(blueprintCodesValue);
    if (blueprintCsv) {
      params.set('bc', blueprintCsv);
    } else {
      params.delete('bc');
    }
    const tagCsv = toCsv(tagsValue);
    if (tagCsv) {
      params.set('tg', tagCsv);
    } else {
      params.delete('tg');
    }
    if (collectionIdValue) {
      params.set('cid', collectionIdValue);
    } else {
      params.delete('cid');
    }
    params.set('quick', '1');
    return params;
  }

  async function startQuickDrillWithFilters({
    searchValue,
    typesValue,
    blueprintCodesValue,
    tagsValue,
    collectionIdValue,
  }) {
    if (!typesValue || typesValue.length === 0) {
      setQuickMessage('Pick at least one type.');
      return;
    }
    setQuickLoading(true);
    const { matches, error } = await fetchQuickMatches({
      searchTerm: searchValue,
      types: typesValue,
      blueprintCodes: blueprintCodesValue,
      tags: tagsValue,
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
      blueprintCodesValue,
      tagsValue,
      collectionIdValue,
    });
    router.push(`${pathname}?${params.toString()}`);

    const picked = filtered.slice(0, 10);
    const quickType = typesValue.length === 1 ? typesValue[0] : 'any';
    const quickPrefix = searchValue?.trim() ? `search:${searchValue.trim()}` : 'quick';
    setActiveSessionMeta({ codePrefix: quickPrefix, type: quickType });
    setQuestions(picked);
    setStarted(true);
    void trackEvent('drill_start', { codePrefix: quickPrefix, type: quickType });
    if (picked.length < 10) {
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
      blueprintCodesValue: quickBlueprintCodes,
      tagsValue: quickTags,
      collectionIdValue: selectedCollectionId,
    });
  }

  function launchCollection(collection) {
    const nextTypes =
      Array.isArray(collection.types) && collection.types.length > 0
        ? collection.types.filter((type) => QUICK_TYPES.includes(type))
        : QUICK_TYPES;
    const nextTypesState = {
      mcq: nextTypes.includes('mcq'),
      reverse: nextTypes.includes('reverse'),
      fill: nextTypes.includes('fill'),
    };
    const nextQuery = String(collection.query || '');
    const nextBlueprintCodes = Array.isArray(collection.blueprint_codes)
      ? collection.blueprint_codes
      : [];
    const nextTags = Array.isArray(collection.tags)
      ? collection.tags.map((tag) => String(tag || '').trim().toLowerCase()).filter(Boolean)
      : [];

    setQuickSearch(nextQuery);
    setQuickTypes(nextTypesState);
    setQuickBlueprintCodes(nextBlueprintCodes);
    setQuickTags(nextTags);
    setSelectedCollectionId(collection.id);

    void startQuickDrillWithFilters({
      searchValue: nextQuery,
      typesValue: nextTypes,
      blueprintCodesValue: nextBlueprintCodes,
      tagsValue: nextTags,
      collectionIdValue: collection.id,
    });
  }

  return (
    <section>
      <h1>Drill</h1>
      <p>Pick a blueprint topic and start a 10-question drill.</p>

      <details className="runner">
        <summary>Diagnostics</summary>
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
          <ul>
            {diagnosticPackGroups.map((item) => (
              <li key={`pack-${item.value}-${item.count}`}>
                {item.value}: {item.count}
              </li>
            ))}
          </ul>
        ) : null}
        <p>
          Counts grouped by <strong>subtopic</strong>
        </p>
        {diagnosticSubtopicGroups.length > 0 ? (
          <ul>
            {diagnosticSubtopicGroups.map((item) => (
              <li key={`subtopic-${item.value}-${item.count}`}>
                {item.value}: {item.count}
              </li>
            ))}
          </ul>
        ) : null}
        {diagnosticError ? <p className="status error">{diagnosticError}</p> : null}
        {diagnosticLoading ? <p className="muted">Loading diagnostics...</p> : null}
        <div className="drill-controls">
          <button type="button" onClick={() => void loadDiagnostics()} disabled={diagnosticLoading}>
            Refresh diagnostics
          </button>
        </div>
      </details>

      <div className="runner">
        <h2>Quick Collections</h2>
        <p className="muted">Curated one-click sets for fast study starts.</p>
        <div className="drill-controls">
          {studyCollections.map((collection) => (
            <button
              key={collection.id}
              type="button"
              onClick={() => launchCollection(collection)}
              disabled={quickLoading}
            >
              {collection.title}
            </button>
          ))}
        </div>
      </div>

      <div className="runner">
        <h2>Quick Drill</h2>
        <div className="drill-controls">
          <label htmlFor="drill-quick-search">Search content</label>
          <input
            id="drill-quick-search"
            type="text"
            placeholder="e.g., piriformis, sympathetic, blood flow"
            value={quickSearch}
            onChange={(event) => {
              setSelectedCollectionId('');
              setQuickSearch(event.target.value);
            }}
          />
        </div>
        <div className="drill-controls" role="group" aria-label="Quick Drill type filters">
          <span>Types</span>
          <label>
            <input
              type="checkbox"
              checked={quickTypes.mcq}
              onChange={() => toggleQuickType('mcq')}
            />
            MCQ
          </label>
          <label>
            <input
              type="checkbox"
              checked={quickTypes.reverse}
              onChange={() => toggleQuickType('reverse')}
            />
            Reverse
          </label>
          <label>
            <input
              type="checkbox"
              checked={quickTypes.fill}
              onChange={() => toggleQuickType('fill')}
            />
            Fill
          </label>
        </div>
        {selectedCollection ? (
          <p className="muted">
            Selected collection: <strong>{selectedCollection.title}</strong>
          </p>
        ) : null}
        <p className="muted">Matches: {quickMatches == null ? '...' : quickMatches}</p>
        {quickLoading ? <p className="muted">Checking matches...</p> : null}
        {quickMessage ? <p className="status error">{quickMessage}</p> : null}
        <div className="drill-controls">
          <button type="button" onClick={startQuickDrill} disabled={quickLoading}>
            Start Quick Drill
          </button>
        </div>
      </div>

      <div className="drill-controls">
        <label htmlFor="drill-section">Section</label>
        <select
          id="drill-section"
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

      <div className="drill-controls">
        <label htmlFor="drill-subsection">Subsection</label>
        <select
          id="drill-subsection"
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

      <div className="drill-controls">
        <label htmlFor="drill-type">Question type</label>
        <select
          id="drill-type"
          value={questionType}
          onChange={(event) => setQuestionType(event.target.value)}
        >
          <option value="mcq">MCQ</option>
          <option value="reverse">Reverse</option>
          <option value="fill">Fill</option>
        </select>
      </div>

      <div className="drill-controls">
        <label htmlFor="drill-leaf">Leaf (optional)</label>
        <select
          id="drill-leaf"
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

      <div className="runner">
        <p>
          Selected blueprint code: <strong>{selectedCode || 'none'}</strong>
        </p>
        {selectedNode ? (
          <p>
            Selected topic: {selectedNode.code} {selectedNode.title}
          </p>
        ) : null}
        <p className="muted">
          Drill filters by blueprint code: leaf exact match, subsection prefix, section prefix.
        </p>
      </div>

      <div className="drill-controls">
        <button type="button" onClick={startDrill} disabled={loading || !selectedCode}>
          {loading ? 'Loading...' : 'Start Drill'}
        </button>
      </div>

      {message ? <p className="status error">{message}</p> : null}
      {started ? (
        <QuestionRunner
          title={`Drill ${selectedCode}`}
          questions={questions}
          onComplete={handleDrillComplete}
        />
      ) : null}
    </section>
  );
}
