'use client';

import { useMemo, useState } from 'react';
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

  return (
    <section>
      <h1>Drill</h1>
      <p>Pick a blueprint topic for the next focused drill.</p>
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
          Placeholder only for this slice. Future drill sessions will filter questions by
          blueprint code.
        </p>
      </div>

      <div className="muted">
        {/* Future tagging requirement: every content item must include blueprintCode and derived domain path. */}
      </div>
    </section>
  );
}
