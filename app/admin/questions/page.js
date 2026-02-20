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
const SEARCH_TYPE_OPTIONS = [
  { value: 'any', label: 'Any type' },
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

function normalizeWhitespace(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ');
}

function buildPromptSnippet(value, maxLength = 120) {
  const clean = normalizeWhitespace(value);
  if (clean.length <= maxLength) return clean;
  return `${clean.slice(0, maxLength - 1)}...`;
}

function normalizeQuestionType(value) {
  if (value === 'reverse') return 'reverse';
  if (value === 'fill') return 'fill';
  return 'mcq';
}

function parseExplanation(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return createDefaultExplanations();
  }
  return {
    answer: String(value.answer || ''),
    why: String(value.why || ''),
    trap: String(value.trap || ''),
    hook: String(value.hook || ''),
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
  const [lastSavedDraft, setLastSavedDraft] = useState(null);
  const [editingQuestionId, setEditingQuestionId] = useState('');
  const [searchKeyword, setSearchKeyword] = useState('');
  const [searchBlueprintPrefix, setSearchBlueprintPrefix] = useState('');
  const [searchQuestionType, setSearchQuestionType] = useState('any');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchErrorInfo, setSearchErrorInfo] = useState(null);

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
  const validation = useMemo(() => {
    const summary = [];
    const errors = {
      blueprintCode: '',
      questionType: '',
      prompt: '',
      fillAnswer: '',
      choices: ['', '', '', ''],
      correctIndex: '',
      duplicateChoices: '',
    };

    if (!selectedBlueprintCode.trim()) {
      errors.blueprintCode = 'Blueprint code is required.';
      summary.push(errors.blueprintCode);
    }

    if (!questionType) {
      errors.questionType = 'Question type is required.';
      summary.push(errors.questionType);
    }

    if (!prompt.trim()) {
      errors.prompt = 'Prompt is required.';
      summary.push(errors.prompt);
    }

    if (questionType === 'fill') {
      if (!fillAnswer.trim()) {
        errors.fillAnswer = 'Correct answer text is required for Fill.';
        summary.push(errors.fillAnswer);
      }
    } else {
      const normalizedChoices = choices.map((choice) => normalizeWhitespace(choice));
      normalizedChoices.forEach((choice, index) => {
        if (!choice) {
          errors.choices[index] = `${toChoiceLabel(index)} choice is required.`;
        }
      });
      for (const error of errors.choices) {
        if (error) summary.push(error);
      }

      const seen = new Map();
      for (const choice of normalizedChoices) {
        if (!choice) continue;
        seen.set(choice, (seen.get(choice) || 0) + 1);
      }
      const duplicateValues = [...seen.entries()]
        .filter(([, count]) => count > 1)
        .map(([value]) => value);
      if (duplicateValues.length > 0) {
        errors.duplicateChoices = `Duplicate choices are not allowed: ${duplicateValues.join(', ')}`;
        summary.push(errors.duplicateChoices);
      }

      if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex > 3) {
        errors.correctIndex = 'Select the correct choice (A-D).';
        summary.push(errors.correctIndex);
      }
    }

    return {
      isValid: summary.length === 0,
      summary,
      errors,
    };
  }, [choices, correctIndex, fillAnswer, prompt, questionType, selectedBlueprintCode]);
  const previewQuestion = useMemo(() => {
    const normalizedChoices = isFillType
      ? [normalizeWhitespace(fillAnswer), '', '', '']
      : choices.map((choice) => normalizeWhitespace(choice));
    const normalizedCorrectIndex = isFillType ? 0 : correctIndex;
    const normalizedExplanations = {
      answer:
        normalizeWhitespace(explanations.answer) ||
        normalizeWhitespace(normalizedChoices[normalizedCorrectIndex]),
      why: normalizeWhitespace(explanations.why),
      trap: normalizeWhitespace(explanations.trap),
      hook: normalizeWhitespace(explanations.hook),
    };

    return {
      question_type: questionType,
      prompt: prompt || '',
      choices: normalizedChoices,
      correct_index: normalizedCorrectIndex,
      explanation: normalizedExplanations,
    };
  }, [choices, correctIndex, explanations, fillAnswer, isFillType, prompt, questionType]);

  const isEditing = Boolean(editingQuestionId);

  function onSelectBlueprint(code) {
    setSelectedBlueprintCode(code);
    setSavedInfo(null);
    setErrorInfo(null);
  }

  function clearDraft(keepBlueprintAndType = true) {
    setPrompt('');
    setChoices(createDefaultChoices());
    setCorrectIndex(0);
    setFillAnswer('');
    setExplanations(createDefaultExplanations());
    setSavedInfo(null);
    setErrorInfo(null);
    setEditingQuestionId('');
    if (!keepBlueprintAndType) {
      setSelectedBlueprintCode('');
      setQuestionType('mcq');
    }
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
    if (!validation.isValid) {
      return {
        ok: false,
        error: toErrorInfo({ message: `Fix validation issues before saving (${validation.summary.length}).` }),
      };
    }
    return { ok: true };
  }

  function buildInsertPayload() {
    const selectedCode = selectedBlueprintCode;
    const sectionCode = selectedCode.split('.')[0];
    const domain = DOMAIN_BY_SECTION_CODE[sectionCode] || 'general';
    const subtopic = selectedCode;
    const trimmedPrompt = normalizeWhitespace(prompt);

    const normalizedChoices = isFillType
      ? [normalizeWhitespace(fillAnswer), '', '', '']
      : choices.map((choice) => normalizeWhitespace(choice));
    const normalizedCorrectIndex = isFillType ? 0 : correctIndex;

    const normalizedExplanations = {
      answer: normalizeWhitespace(explanations.answer) || normalizedChoices[normalizedCorrectIndex] || '',
      why: normalizeWhitespace(explanations.why),
      trap: normalizeWhitespace(explanations.trap),
      hook: normalizeWhitespace(explanations.hook),
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
      const isPatch = Boolean(editingQuestionId);
      const path = isPatch
        ? `questions?id=eq.${encodeURIComponent(editingQuestionId)}`
        : 'questions';
      const method = isPatch ? 'PATCH' : 'POST';
      const response = await withTimeout(
        postgrestFetch(path, {
          method,
          body: payload,
          headers: { prefer: 'return=representation' },
        }),
        8000,
        isPatch ? 'forge_update_question' : 'forge_insert_question'
      );

      if (!response.ok) {
        throw toPostgrestError(response, isPatch ? 'Failed to update question.' : 'Failed to save question.');
      }

      const row = Array.isArray(response.data) ? response.data[0] || null : null;
      setSavedInfo({
        id: row?.id || 'unknown',
        blueprintCode: payload.blueprint_code,
        questionType: payload.question_type,
        action: isPatch ? 'updated' : 'saved',
      });
      setLastSavedDraft({
        blueprintCode: payload.blueprint_code,
        questionType: payload.question_type,
        prompt: payload.prompt,
        choices: Array.isArray(payload.choices) ? payload.choices.slice(0, 4) : createDefaultChoices(),
        correctIndex: Number.isInteger(payload.correct_index) ? payload.correct_index : 0,
        fillAnswer: Array.isArray(payload.choices) ? payload.choices[0] || '' : '',
        explanations: {
          answer: payload.explanation?.answer || '',
          why: payload.explanation?.why || '',
          trap: payload.explanation?.trap || '',
          hook: payload.explanation?.hook || '',
        },
      });

      if (mode === 'save_new') {
        clearDraft(true);
      }
    } catch (error) {
      setErrorInfo(toErrorInfo(error, isEditing ? 'Failed to update question.' : 'Failed to save question.'));
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

  async function handleSearchQuestions(event) {
    if (event?.preventDefault) event.preventDefault();
    setSearching(true);
    setSearchErrorInfo(null);

    try {
      const params = new URLSearchParams({
        select: 'id,blueprint_code,question_type,prompt,choices,correct_index,explanation,created_at',
        order: 'created_at.desc',
        limit: '25',
      });

      const trimmedKeyword = normalizeWhitespace(searchKeyword);
      if (trimmedKeyword) {
        params.set('prompt', `ilike.*${trimmedKeyword}*`);
      }

      const trimmedPrefix = normalizeWhitespace(searchBlueprintPrefix).toUpperCase();
      if (trimmedPrefix) {
        params.set('blueprint_code', `like.${trimmedPrefix}%`);
      }

      if (searchQuestionType !== 'any') {
        params.set('question_type', `eq.${searchQuestionType}`);
      }

      const response = await withTimeout(
        postgrestFetch(`questions?${params.toString()}`),
        8000,
        'forge_search_questions'
      );
      if (!response.ok) {
        throw toPostgrestError(response, 'Failed to search questions.');
      }
      setSearchResults(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      setSearchErrorInfo(toErrorInfo(error, 'Failed to search questions.'));
    } finally {
      setSearching(false);
    }
  }

  function handleLoadSearchResult(result) {
    if (!result || !result.id) return;

    const normalizedType = normalizeQuestionType(result.question_type);
    const loadedChoices = Array.isArray(result.choices)
      ? result.choices.slice(0, 4).map((choice) => String(choice || ''))
      : createDefaultChoices();
    while (loadedChoices.length < 4) {
      loadedChoices.push('');
    }
    const loadedCorrectIndex =
      Number.isInteger(result.correct_index) && result.correct_index >= 0 && result.correct_index <= 3
        ? result.correct_index
        : 0;
    const explanation = parseExplanation(result.explanation);

    setEditingQuestionId(result.id);
    setSelectedBlueprintCode(String(result.blueprint_code || ''));
    setQuestionType(normalizedType);
    setPrompt(String(result.prompt || ''));
    setChoices(loadedChoices);
    setCorrectIndex(loadedCorrectIndex);
    setFillAnswer(normalizedType === 'fill' ? String(loadedChoices[loadedCorrectIndex] || loadedChoices[0] || '') : '');
    setExplanations(explanation);
    setSavedInfo(null);
    setErrorInfo(null);
  }

  function handleDuplicateLastQuestion() {
    if (!lastSavedDraft) return;
    setEditingQuestionId('');
    setSelectedBlueprintCode(lastSavedDraft.blueprintCode || '');
    setQuestionType(lastSavedDraft.questionType || 'mcq');
    setPrompt(lastSavedDraft.prompt || '');
    setChoices(Array.isArray(lastSavedDraft.choices) ? lastSavedDraft.choices.slice(0, 4) : createDefaultChoices());
    setCorrectIndex(Number.isInteger(lastSavedDraft.correctIndex) ? lastSavedDraft.correctIndex : 0);
    setFillAnswer(lastSavedDraft.fillAnswer || '');
    setExplanations({
      answer: lastSavedDraft.explanations?.answer || '',
      why: lastSavedDraft.explanations?.why || '',
      trap: lastSavedDraft.explanations?.trap || '',
      hook: lastSavedDraft.explanations?.hook || '',
    });
    setSavedInfo(null);
    setErrorInfo(null);
  }

  function handleStartNewQuestion() {
    clearDraft(false);
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
      <div className="game-card">
        <h2>Search Existing Questions</h2>
        <form className="auth-form" onSubmit={handleSearchQuestions}>
          <label htmlFor="forge-search-keyword">Keyword</label>
          <input
            id="forge-search-keyword"
            type="text"
            value={searchKeyword}
            onChange={(event) => setSearchKeyword(event.target.value)}
            placeholder="Search prompt text"
          />

          <label htmlFor="forge-search-prefix">Blueprint prefix</label>
          <input
            id="forge-search-prefix"
            type="text"
            value={searchBlueprintPrefix}
            onChange={(event) => setSearchBlueprintPrefix(event.target.value.toUpperCase())}
            placeholder="2.D"
          />

          <label htmlFor="forge-search-type">Type</label>
          <select
            id="forge-search-type"
            value={searchQuestionType}
            onChange={(event) => setSearchQuestionType(event.target.value)}
          >
            {SEARCH_TYPE_OPTIONS.map((option) => (
              <option key={`forge-search-type-${option.value}`} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <button type="submit" disabled={searching}>
            {searching ? 'Searching...' : 'Search'}
          </button>
        </form>
        {searchErrorInfo ? (
          <div className="status error">
            <p>{searchErrorInfo.message}</p>
            {searchErrorInfo.details ? <p>Details: {searchErrorInfo.details}</p> : null}
            {searchErrorInfo.hint ? <p>Hint: {searchErrorInfo.hint}</p> : null}
            {searchErrorInfo.code ? <p>Code: {searchErrorInfo.code}</p> : null}
            {searchErrorInfo.status ? <p>Status: {searchErrorInfo.status}</p> : null}
          </div>
        ) : null}
        <div className="choice-list" role="listbox" aria-label="Question search results">
          {searchResults.map((result) => (
            <button
              key={`forge-result-${result.id}`}
              type="button"
              onClick={() => handleLoadSearchResult(result)}
              className={editingQuestionId === result.id ? 'active-btn' : ''}
              aria-selected={editingQuestionId === result.id}
            >
              {result.blueprint_code || 'n/a'} | {normalizeQuestionType(result.question_type)} |{' '}
              {buildPromptSnippet(result.prompt)}
            </button>
          ))}
        </div>
        <p className="muted">{searchResults.length} result(s).</p>
      </div>

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
          {isEditing ? (
            <div className="status success">
              <p>Editing {editingQuestionId}</p>
              <button type="button" onClick={handleStartNewQuestion}>
                New Question
              </button>
            </div>
          ) : null}
          <div className="runner">
            <p className="muted">
              Required fields: Blueprint code, question type, prompt, and Answer/Why/Trap/Hook guidance.
            </p>
          </div>
          {!validation.isValid ? (
            <div className="status error">
              <p>Fix these before saving:</p>
              {validation.summary.slice(0, 5).map((item, index) => (
                <p key={`forge-validation-${index}`}>{item}</p>
              ))}
            </div>
          ) : null}
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
          {validation.errors.questionType ? <p className="status error">{validation.errors.questionType}</p> : null}

          <form className="auth-form" onSubmit={handleSubmit}>
            <label htmlFor="forge-blueprint-code">Blueprint code</label>
            <input
              id="forge-blueprint-code"
              type="text"
              value={selectedBlueprintCode}
              readOnly
              placeholder="Pick from left panel"
            />
            {validation.errors.blueprintCode ? <p className="status error">{validation.errors.blueprintCode}</p> : null}

            <label htmlFor="forge-prompt">Prompt</label>
            <textarea
              id="forge-prompt"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="Write the question prompt"
              rows={4}
            />
            {validation.errors.prompt ? <p className="status error">{validation.errors.prompt}</p> : null}

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
                {validation.errors.fillAnswer ? <p className="status error">{validation.errors.fillAnswer}</p> : null}
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
                    {validation.errors.choices[index] ? (
                      <p className="status error">{validation.errors.choices[index]}</p>
                    ) : null}
                  </div>
                ))}
                {validation.errors.duplicateChoices ? (
                  <p className="status error">{validation.errors.duplicateChoices}</p>
                ) : null}

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
                {validation.errors.correctIndex ? <p className="status error">{validation.errors.correctIndex}</p> : null}
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
              <button type="submit" disabled={Boolean(savingMode) || !validation.isValid}>
                {savingMode === 'save' ? 'Saving...' : 'Save'}
              </button>
              <button
                type="button"
                onClick={handleSaveNew}
                disabled={Boolean(savingMode) || !validation.isValid}
              >
                {savingMode === 'save_new' ? 'Saving...' : 'Save & New'}
              </button>
            </div>
          </form>

          <h3>Preview</h3>
          <div className="runner">
            <p className="muted">Read-only preview of what will be saved.</p>
            <p className="runner-prompt">{previewQuestion.prompt || 'Prompt preview...'}</p>
            {isFillType ? (
              <p className="muted">
                Correct fill answer: <strong>{previewQuestion.choices[0] || 'n/a'}</strong>
              </p>
            ) : (
              <div className="choice-list">
                {previewQuestion.choices.map((choice, index) => {
                  const isCorrect = previewQuestion.correct_index === index;
                  return (
                    <button
                      key={`preview-choice-${index}`}
                      type="button"
                      className={`choice-btn${isCorrect ? ' selected' : ''}`}
                      disabled
                    >
                      {toChoiceLabel(index)}. {choice || '(empty)'}
                    </button>
                  );
                })}
              </div>
            )}
            {EXPLANATION_FIELDS.map((field) => {
              const text = previewQuestion.explanation?.[field] || '';
              if (!text) return null;
              return (
                <div key={`preview-explanation-${field}`} className="explanation-box">
                  <strong>{field.charAt(0).toUpperCase() + field.slice(1)}:</strong> {text}
                </div>
              );
            })}
          </div>

          {savedInfo ? (
            <div className="status success">
              <p>{savedInfo.action === 'updated' ? 'Updated' : 'Saved'} (id: {savedInfo.id})</p>
              <p>
                {savedInfo.blueprintCode} | {savedInfo.questionType}
              </p>
              <button type="button" onClick={handleDuplicateLastQuestion} disabled={!lastSavedDraft}>
                Duplicate
              </button>
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
