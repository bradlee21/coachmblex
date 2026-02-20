'use client';

import { useMemo, useState } from 'react';
import { listAllNodesFlat } from '../../../src/content/mblexBlueprint';
import { postgrestFetch } from '../../../src/lib/postgrestFetch';
import { useAuth } from '../../../src/providers/AuthProvider';

const QUESTION_TYPE_OPTIONS = [
  { value: 'mcq', label: 'MCQ' },
  { value: 'reverse', label: 'Reverse' },
  { value: 'fill', label: 'Fill' },
];
const EXPLANATION_FIELDS = ['answer', 'why', 'trap', 'hook'];
const SOFT_EXPLANATION_CHAR_LIMIT = 200;
const DOMAIN_BY_SECTION_CODE = {
  '1': 'anatomy',
  '2': 'kinesiology',
  '3': 'pathology',
  '4': 'benefits-effects',
  '5': 'assessment',
  '6': 'ethics',
  '7': 'practice',
};

function withTimeout(promise, ms = 8000, label = 'operation') {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);

    Promise.resolve(promise)
      .then(resolve)
      .catch(reject)
      .finally(() => clearTimeout(timeoutId));
  });
}

function toErrorInfo(error, fallbackMessage = 'Unexpected error.') {
  return {
    message:
      typeof error?.message === 'string' && error.message.trim() ? error.message : fallbackMessage,
    details: typeof error?.details === 'string' ? error.details : '',
    hint: typeof error?.hint === 'string' ? error.hint : '',
    code:
      typeof error?.code === 'string' || typeof error?.code === 'number'
        ? String(error.code)
        : '',
    status:
      typeof error?.status === 'string' || typeof error?.status === 'number'
        ? String(error.status)
        : '',
  };
}

function toPostgrestError(response, fallbackMessage) {
  const payload =
    response && response.data && typeof response.data === 'object' && !Array.isArray(response.data)
      ? response.data
      : null;
  return {
    message: payload?.message || response?.errorText || fallbackMessage,
    details: payload?.details || '',
    hint: payload?.hint || '',
    code: payload?.code ? String(payload.code) : '',
    status:
      typeof response?.status === 'number' || typeof response?.status === 'string'
        ? String(response.status)
        : '',
  };
}

function normalizeRole(value) {
  if (value === 'admin') return 'admin';
  if (value === 'questions_editor') return 'questions_editor';
  return 'user';
}

function buildPath(node, byCode) {
  const path = [];
  let current = node;
  while (current) {
    path.unshift(current);
    current = current.parentCode ? byCode[current.parentCode] || null : null;
  }
  return path;
}

function toChoiceLabel(index) {
  return String.fromCharCode(65 + index);
}

function createDefaultChoices() {
  return ['', '', '', ''];
}

function createDefaultExplanations() {
  return {
    answer: '',
    why: '',
    trap: '',
    hook: '',
  };
}

export default function AdminQuestionsPage() {
  const { user, role, loading } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [questionType, setQuestionType] = useState('mcq');
  const [selectedBlueprintCode, setSelectedBlueprintCode] = useState('');
  const [prompt, setPrompt] = useState('');
  const [choices, setChoices] = useState(createDefaultChoices());
  const [correctIndex, setCorrectIndex] = useState(0);
  const [fillAnswer, setFillAnswer] = useState('');
  const [explanations, setExplanations] = useState(createDefaultExplanations());
  const [savingMode, setSavingMode] = useState('');
  const [errorInfo, setErrorInfo] = useState(null);
  const [savedInfo, setSavedInfo] = useState(null);

  const allNodes = useMemo(() => listAllNodesFlat(), []);
  const nodeByCode = useMemo(
    () =>
      Object.fromEntries(
        allNodes.map((node) => [node.code, node])
      ),
    [allNodes]
  );
  const nodesWithMeta = useMemo(
    () =>
      allNodes.map((node) => {
        const path = buildPath(node, nodeByCode);
        const hasChildren = allNodes.some((candidate) => candidate.parentCode === node.code);
        return {
          ...node,
          isLeaf: !hasChildren,
          path,
          pathLabel: path.map((item) => `${item.code} ${item.title}`).join(' > '),
        };
      }),
    [allNodes, nodeByCode]
  );

  const selectedNode = useMemo(
    () => nodesWithMeta.find((node) => node.code === selectedBlueprintCode) || null,
    [nodesWithMeta, selectedBlueprintCode]
  );
  const filteredNodes = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const base = nodesWithMeta
      .filter((node) => {
        if (!query) return true;
        return (
          node.code.toLowerCase().includes(query) ||
          node.title.toLowerCase().includes(query) ||
          node.pathLabel.toLowerCase().includes(query)
        );
      })
      .sort((a, b) =>
        a.code.localeCompare(b.code, undefined, { numeric: true, sensitivity: 'base' })
      );
    return base.slice(0, 140);
  }, [nodesWithMeta, searchQuery]);

  const selectedPathLabel = selectedNode
    ? selectedNode.path.map((item) => `${item.code} ${item.title}`).join(' > ')
    : '';
  const isFillType = questionType === 'fill';
  const canAccess = ['admin', 'questions_editor'].includes(normalizeRole(role));

  function onSelectBlueprint(code) {
    setSelectedBlueprintCode(code);
    setSavedInfo(null);
    setErrorInfo(null);
  }

  function updateChoice(index, value) {
    setChoices((current) => {
      const next = [...current];
      next[index] = value;
      return next;
    });
  }

  function updateExplanation(key, value) {
    setExplanations((current) => ({ ...current, [key]: value }));
  }

  function validatePayload() {
    const trimmedPrompt = prompt.trim();
    if (!selectedBlueprintCode) {
      return { ok: false, error: toErrorInfo({ message: 'Select a blueprint code.' }) };
    }
    if (!trimmedPrompt) {
      return { ok: false, error: toErrorInfo({ message: 'Prompt is required.' }) };
    }

    if (isFillType) {
      const trimmedFillAnswer = fillAnswer.trim();
      if (!trimmedFillAnswer) {
        return {
          ok: false,
          error: toErrorInfo({ message: 'Fill questions require a correct answer text.' }),
        };
      }
      return { ok: true };
    }

    const normalizedChoices = choices.map((choice) => choice.trim());
    if (normalizedChoices.some((choice) => !choice)) {
      return {
        ok: false,
        error: toErrorInfo({ message: 'MCQ/Reverse questions require all 4 choices.' }),
      };
    }
    if (correctIndex < 0 || correctIndex > 3) {
      return {
        ok: false,
        error: toErrorInfo({ message: 'Select the correct choice (A-D).' }),
      };
    }

    return { ok: true };
  }

  function buildInsertPayload() {
    const selectedCode = selectedBlueprintCode;
    const sectionCode = selectedCode.split('.')[0];
    const domain = DOMAIN_BY_SECTION_CODE[sectionCode] || 'general';
    const subtopic = selectedCode;
    const trimmedPrompt = prompt.trim();

    const normalizedChoices = isFillType
      ? [fillAnswer.trim(), '', '', '']
      : choices.map((choice) => choice.trim());
    const normalizedCorrectIndex = isFillType ? 0 : correctIndex;

    const normalizedExplanations = {
      answer: explanations.answer.trim() || normalizedChoices[normalizedCorrectIndex] || '',
      why: explanations.why.trim(),
      trap: explanations.trap.trim(),
      hook: explanations.hook.trim(),
    };

    return {
      domain,
      subtopic,
      blueprint_code: selectedCode,
      question_type: questionType,
      prompt: trimmedPrompt,
      choices: normalizedChoices,
      correct_index: normalizedCorrectIndex,
      explanation: normalizedExplanations,
      difficulty: 'medium',
    };
  }

  async function saveQuestion(mode) {
    if (savingMode) return;
    const validation = validatePayload();
    if (!validation.ok) {
      setErrorInfo(validation.error);
      setSavedInfo(null);
      return;
    }

    setSavingMode(mode);
    setErrorInfo(null);
    setSavedInfo(null);

    try {
      const payload = buildInsertPayload();
      const response = await withTimeout(
        postgrestFetch('questions', {
          method: 'POST',
          body: payload,
          headers: { prefer: 'return=representation' },
        }),
        8000,
        'forge_insert_question'
      );

      if (!response.ok) {
        throw toPostgrestError(response, 'Failed to save question.');
      }

      const row = Array.isArray(response.data) ? response.data[0] || null : null;
      setSavedInfo({
        id: row?.id || 'unknown',
        blueprintCode: payload.blueprint_code,
        questionType: payload.question_type,
      });

      if (mode === 'save_new') {
        setPrompt('');
        setChoices(createDefaultChoices());
        setCorrectIndex(0);
        setFillAnswer('');
        setExplanations(createDefaultExplanations());
      }
    } catch (error) {
      setErrorInfo(toErrorInfo(error, 'Failed to save question.'));
    } finally {
      setSavingMode('');
    }
  }

  function handleSubmit(event) {
    event.preventDefault();
    void saveQuestion('save');
  }

  function handleSaveNew() {
    void saveQuestion('save_new');
  }

  if (loading) {
    return (
      <section>
        <h1>Question Forge</h1>
        <p className="muted">Loading session...</p>
      </section>
    );
  }

  if (!user) {
    return (
      <section>
        <h1>Question Forge</h1>
        <p className="muted">Redirecting to sign in...</p>
      </section>
    );
  }

  if (!canAccess) {
    return (
      <section>
        <h1>Question Forge</h1>
        <p className="status error">You do not have access to this area.</p>
      </section>
    );
  }

  return (
    <section>
      <h1>Question Forge</h1>
      <p>Create and edit MBLEX questions.</p>

      <div className="game-grid">
        <div className="game-card">
          <h2>Blueprint Picker</h2>
          <label htmlFor="forge-blueprint-search">Search</label>
          <input
            id="forge-blueprint-search"
            type="text"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search by code or topic"
            autoComplete="off"
          />
          <p className="muted">
            {selectedBlueprintCode
              ? `Selected code: ${selectedBlueprintCode}`
              : 'Select a blueprint code to continue.'}
          </p>
          {selectedPathLabel ? <p className="muted">Path: {selectedPathLabel}</p> : null}
          <div className="choice-list" role="listbox" aria-label="Blueprint options">
            {filteredNodes.map((node) => (
              <button
                key={node.code}
                type="button"
                className={selectedBlueprintCode === node.code ? 'active-btn' : ''}
                onClick={() => onSelectBlueprint(node.code)}
                title={node.pathLabel}
                aria-selected={selectedBlueprintCode === node.code}
              >
                {node.code} {node.title}
                {node.isLeaf ? '' : ' (node)'}
              </button>
            ))}
          </div>
          <p className="muted">Showing {filteredNodes.length} matching nodes.</p>
        </div>

        <div className="game-card">
          <h2>Question Form</h2>
          <div className="runner">
            <p className="muted">
              Required fields: Blueprint code, question type, prompt, and Answer/Why/Trap/Hook guidance.
            </p>
          </div>
          <div className="button-row">
            {QUESTION_TYPE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={questionType === option.value ? 'active-btn' : ''}
                onClick={() => setQuestionType(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>

          <form className="auth-form" onSubmit={handleSubmit}>
            <label htmlFor="forge-blueprint-code">Blueprint code</label>
            <input
              id="forge-blueprint-code"
              type="text"
              value={selectedBlueprintCode}
              readOnly
              placeholder="Pick from left panel"
            />

            <label htmlFor="forge-prompt">Prompt</label>
            <textarea
              id="forge-prompt"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="Write the question prompt"
              rows={4}
            />

            {isFillType ? (
              <>
                <label htmlFor="forge-fill-answer">Correct answer text</label>
                <input
                  id="forge-fill-answer"
                  type="text"
                  value={fillAnswer}
                  onChange={(event) => setFillAnswer(event.target.value)}
                  placeholder="Enter the expected fill answer"
                />
              </>
            ) : (
              <>
                <p className="muted">Choices</p>
                {choices.map((choice, index) => (
                  <div key={`forge-choice-${index}`}>
                    <label htmlFor={`forge-choice-${index}`}>
                      {toChoiceLabel(index)} choice
                    </label>
                    <input
                      id={`forge-choice-${index}`}
                      type="text"
                      value={choice}
                      onChange={(event) => updateChoice(index, event.target.value)}
                      placeholder={`Choice ${toChoiceLabel(index)}`}
                    />
                  </div>
                ))}

                <label htmlFor="forge-correct-index">Correct choice</label>
                <select
                  id="forge-correct-index"
                  value={correctIndex}
                  onChange={(event) => setCorrectIndex(Number(event.target.value))}
                >
                  {[0, 1, 2, 3].map((index) => (
                    <option key={`forge-correct-${index}`} value={index}>
                      {toChoiceLabel(index)}
                    </option>
                  ))}
                </select>
              </>
            )}

            <h3>Explanation Blocks</h3>
            <p className="muted">Keep each block under ~200 chars when possible.</p>
            {EXPLANATION_FIELDS.map((field) => {
              const value = explanations[field] || '';
              const length = value.trim().length;
              const isLong = length > SOFT_EXPLANATION_CHAR_LIMIT;
              return (
                <div key={`forge-explanation-${field}`}>
                  <label htmlFor={`forge-explanation-${field}`}>
                    {field.charAt(0).toUpperCase() + field.slice(1)}
                  </label>
                  <textarea
                    id={`forge-explanation-${field}`}
                    value={value}
                    onChange={(event) => updateExplanation(field, event.target.value)}
                    rows={2}
                  />
                  <p className={isLong ? 'status error' : 'muted'}>
                    {length}/{SOFT_EXPLANATION_CHAR_LIMIT}
                  </p>
                </div>
              );
            })}

            <div className="button-row">
              <button type="submit" disabled={Boolean(savingMode)}>
                {savingMode === 'save' ? 'Saving...' : 'Save'}
              </button>
              <button type="button" onClick={handleSaveNew} disabled={Boolean(savingMode)}>
                {savingMode === 'save_new' ? 'Saving...' : 'Save & New'}
              </button>
            </div>
          </form>

          {savedInfo ? (
            <div className="status success">
              <p>Saved (id: {savedInfo.id})</p>
              <p>
                {savedInfo.blueprintCode} | {savedInfo.questionType}
              </p>
            </div>
          ) : null}

          {errorInfo ? (
            <div className="status error">
              <p>{errorInfo.message}</p>
              {errorInfo.details ? <p>Details: {errorInfo.details}</p> : null}
              {errorInfo.hint ? <p>Hint: {errorInfo.hint}</p> : null}
              {errorInfo.code ? <p>Code: {errorInfo.code}</p> : null}
              {errorInfo.status ? <p>Status: {errorInfo.status}</p> : null}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
