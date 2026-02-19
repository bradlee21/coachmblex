'use client';

import { useMemo, useState } from 'react';
import QuestionRunner from '../_components/QuestionRunner';
import { getSupabaseClient } from '../../src/lib/supabaseClient';
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

export default function DrillPage() {
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
  const [questions, setQuestions] = useState([]);
  const [started, setStarted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

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

  async function startDrill() {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setMessage('Supabase is not configured. Check NEXT_PUBLIC_* environment values.');
      return;
    }

    const query = supabase
      .from('questions')
      .select(
        'id,domain,subtopic,blueprint_code,prompt,choices,correct_index,explanation,difficulty,created_at'
      )
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
    setQuestions(picked);
    setStarted(true);
    if (picked.length < 10) {
      setMessage(
        `Only ${picked.length} question(s) found for ${selectedCode}. Add more tagged content to reach 10.`
      );
    }
    setLoading(false);
  }

  return (
    <section>
      <h1>Drill</h1>
      <p>Pick a blueprint topic and start a 10-question drill.</p>
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
      {started ? <QuestionRunner title={`Drill ${selectedCode}`} questions={questions} /> : null}
    </section>
  );
}
