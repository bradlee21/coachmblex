'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import QuestionRunner from '../_components/QuestionRunner';
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

const QUICK_TYPES = ['mcq', 'reverse', 'fill'];

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
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [activeSessionMeta, setActiveSessionMeta] = useState({ codePrefix: '', type: 'mcq' });

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

  const refreshQuickMatches = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setQuickMatches(0);
      setQuickQuestions([]);
      setQuickMessage('Supabase is not configured. Check NEXT_PUBLIC_* environment values.');
      return;
    }

    if (selectedQuickTypes.length === 0) {
      setQuickMatches(0);
      setQuickQuestions([]);
      setQuickMessage('Pick at least one type.');
      return;
    }

    const requestId = quickSearchRequestIdRef.current + 1;
    quickSearchRequestIdRef.current = requestId;
    setQuickLoading(true);
    setQuickMessage('');

    const { data, error } = await supabase
      .from('questions')
      .select(
        'id,domain,subtopic,blueprint_code,question_type,prompt,choices,correct_index,explanation,difficulty,created_at'
      )
      .in('question_type', selectedQuickTypes)
      .order('created_at', { ascending: false })
      .limit(1000);

    if (requestId !== quickSearchRequestIdRef.current) return;

    if (error) {
      setQuickMatches(0);
      setQuickQuestions([]);
      setQuickMessage(`Failed to load quick drill matches: ${error.message}`);
      setQuickLoading(false);
      return;
    }

    const term = quickSearch.trim().toLowerCase();
    const filtered = (data || []).filter((question) => {
      if (!selectedQuickTypes.includes(getQuestionType(question))) return false;
      return matchesQuickSearch(question, term);
    });

    setQuickQuestions(filtered);
    setQuickMatches(filtered.length);
    if (filtered.length === 0) {
      setQuickMessage('No matches. Try a broader term.');
    } else {
      setQuickMessage('');
    }
    setQuickLoading(false);
  }, [quickSearch, selectedQuickTypes]);

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
    setQuickTypes((prev) => ({
      ...prev,
      [type]: !prev[type],
    }));
  }

  function startQuickDrill() {
    if (selectedQuickTypes.length === 0) {
      setQuickMessage('Pick at least one type.');
      return;
    }

    if (quickQuestions.length === 0) {
      setQuickMessage('No matches. Try a broader term.');
      return;
    }

    const params = new URLSearchParams(searchParams.toString());
    const trimmedSearch = quickSearch.trim();
    if (trimmedSearch) {
      params.set('q', trimmedSearch);
    } else {
      params.delete('q');
    }
    params.set('qt', selectedQuickTypes.join(','));
    params.set('quick', '1');
    router.push(`${pathname}?${params.toString()}`);

    const picked = quickQuestions.slice(0, 10);
    const quickType = selectedQuickTypes.length === 1 ? selectedQuickTypes[0] : 'any';
    const quickPrefix = trimmedSearch ? `search:${trimmedSearch}` : 'quick';
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
  }

  return (
    <section>
      <h1>Drill</h1>
      <p>Pick a blueprint topic and start a 10-question drill.</p>

      <div className="runner">
        <h2>Quick Drill</h2>
        <div className="drill-controls">
          <label htmlFor="drill-quick-search">Search content</label>
          <input
            id="drill-quick-search"
            type="text"
            placeholder="e.g., piriformis, sympathetic, blood flow"
            value={quickSearch}
            onChange={(event) => setQuickSearch(event.target.value)}
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
