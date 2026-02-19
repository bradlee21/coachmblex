'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getSupabaseClient } from '../../src/lib/supabaseClient';
import { useAuth } from '../../src/providers/AuthProvider';

export default function DiagramQuiz({
  svg,
  targets,
  labels,
  blueprint_code,
  regionKey,
  labelSetId = 'default',
}) {
  const { user } = useAuth();
  const svgContainerRef = useRef(null);
  const [placements, setPlacements] = useState({});
  const [armedLabelId, setArmedLabelId] = useState('');
  const [hoveredTargetId, setHoveredTargetId] = useState('');
  const [saveMessage, setSaveMessage] = useState('');
  const [savedOnce, setSavedOnce] = useState(false);

  const labelsById = useMemo(
    () => new Map(labels.map((label) => [label.id, label])),
    [labels]
  );

  const score = useMemo(
    () => Object.values(placements).filter((item) => item.correct).length,
    [placements]
  );
  const total = labels.length;
  const complete = Object.keys(placements).length === total;

  const targetStateById = useMemo(() => {
    const next = {};
    for (const target of targets) {
      next[target.id] = '';
    }
    for (const item of Object.values(placements)) {
      next[item.targetId] = item.correct ? 'correct' : 'wrong';
    }
    return next;
  }, [placements, targets]);

  const placeLabel = useCallback(
    (labelId, targetId) => {
      const label = labelsById.get(labelId);
      if (!label) return;
      const correct = label.targetId === targetId;
      setPlacements((prev) => ({
        ...prev,
        [labelId]: { labelId, targetId, correct },
      }));
      setArmedLabelId('');
    },
    [labelsById]
  );

  const saveAttempt = useCallback(async () => {
    if (savedOnce) return;
    setSavedOnce(true);

    const supabase = getSupabaseClient();
    if (!supabase || !user?.id) {
      setSaveMessage('Could not save attempt (missing session/config).');
      return;
    }

    const { error } = await supabase.from('diagram_attempts').insert({
      user_id: user.id,
      region_key: regionKey,
      label_set_id: labelSetId,
      blueprint_code,
      score,
      total,
    });

    if (error) {
      setSaveMessage(`Attempt not saved: ${error.message}`);
      return;
    }

    setSaveMessage('Attempt saved.');
  }, [blueprint_code, labelSetId, regionKey, savedOnce, score, total, user?.id]);

  useEffect(() => {
    if (!complete) return;
    saveAttempt();
  }, [complete, saveAttempt]);

  useEffect(() => {
    function handleEsc(event) {
      if (event.key === 'Escape') {
        setArmedLabelId('');
      }
    }
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, []);

  useEffect(() => {
    const root = svgContainerRef.current;
    if (!root) return undefined;

    const cleanups = [];
    for (const target of targets) {
      const element = root.querySelector(`#${target.id}`);
      if (!element) continue;

      element.setAttribute('data-diagram-target', 'true');
      element.setAttribute('tabindex', '0');

      const onDragOver = (event) => {
        event.preventDefault();
        setHoveredTargetId(target.id);
      };
      const onDrop = (event) => {
        event.preventDefault();
        const labelId = event.dataTransfer.getData('text/plain');
        if (labelId) placeLabel(labelId, target.id);
      };
      const onClick = () => {
        if (armedLabelId) {
          placeLabel(armedLabelId, target.id);
        }
      };
      const onEnter = () => setHoveredTargetId(target.id);
      const onLeave = () => setHoveredTargetId((prev) => (prev === target.id ? '' : prev));

      element.addEventListener('dragover', onDragOver);
      element.addEventListener('drop', onDrop);
      element.addEventListener('click', onClick);
      element.addEventListener('mouseenter', onEnter);
      element.addEventListener('mouseleave', onLeave);

      cleanups.push(() => {
        element.removeEventListener('dragover', onDragOver);
        element.removeEventListener('drop', onDrop);
        element.removeEventListener('click', onClick);
        element.removeEventListener('mouseenter', onEnter);
        element.removeEventListener('mouseleave', onLeave);
      });
    }

    return () => {
      for (const cleanup of cleanups) cleanup();
    };
  }, [armedLabelId, placeLabel, targets]);

  useEffect(() => {
    const root = svgContainerRef.current;
    if (!root) return;

    for (const target of targets) {
      const element = root.querySelector(`#${target.id}`);
      if (!element) continue;

      element.classList.toggle('is-hovered', hoveredTargetId === target.id);
      element.classList.toggle('is-correct', targetStateById[target.id] === 'correct');
      element.classList.toggle('is-wrong', targetStateById[target.id] === 'wrong');
    }
  }, [hoveredTargetId, targetStateById, targets]);

  function resetQuiz() {
    setPlacements({});
    setArmedLabelId('');
    setHoveredTargetId('');
    setSaveMessage('');
    setSavedOnce(false);
  }

  const SvgComponent = typeof svg === 'function' ? svg : null;

  return (
    <section className="diagram-layout">
      <div className="diagram-board">
        <div className="diagram-meta">
          <p>
            Blueprint: <strong>{blueprint_code}</strong>
          </p>
          <p>
            Score: {score} / {total}
          </p>
        </div>
        <div className="diagram-svg" ref={svgContainerRef}>
          {SvgComponent ? <SvgComponent /> : <div dangerouslySetInnerHTML={{ __html: svg }} />}
        </div>
      </div>

      <aside className="diagram-panel">
        <h2>Labels</h2>
        <div className="label-list">
          {labels.map((label) => {
            const placed = placements[label.id];
            if (placed) return null;
            return (
              <button
                key={label.id}
                type="button"
                className={`diagram-label${armedLabelId === label.id ? ' armed' : ''}`}
                draggable
                onDragStart={(event) => event.dataTransfer.setData('text/plain', label.id)}
                onClick={() => setArmedLabelId(label.id)}
              >
                {label.text}
              </button>
            );
          })}
        </div>

        <h3>Placed</h3>
        <ul className="placed-list">
          {Object.values(placements).map((item) => (
            <li key={item.labelId} className={item.correct ? 'ok' : 'bad'}>
              {labelsById.get(item.labelId)?.text} {'->'} {item.targetId}
            </li>
          ))}
        </ul>

        <div className="button-row">
          <button type="button" onClick={resetQuiz}>
            Reset
          </button>
          <button type="button" onClick={saveAttempt}>
            Finish
          </button>
        </div>
        <p className="muted">Drag labels to targets, or click a label then click a target.</p>
        {saveMessage ? (
          <p className={`status ${saveMessage.startsWith('Attempt not') ? 'error' : 'success'}`}>
            {saveMessage}
          </p>
        ) : null}
      </aside>
    </section>
  );
}
