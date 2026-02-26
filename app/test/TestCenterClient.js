'use client';

import { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

const MIN_QUESTIONS = 5;
const MAX_QUESTIONS = 150;
const DEFAULT_QUESTIONS = 50;
const ALLOWED_TEST_TYPES = ['mcq', 'reverse'];

function clampQuestionCount(value) {
  const parsed = Number.parseInt(String(value || ''), 10);
  if (!Number.isFinite(parsed)) return DEFAULT_QUESTIONS;
  return Math.min(MAX_QUESTIONS, Math.max(MIN_QUESTIONS, parsed));
}

function sanitizeQtCsv(value) {
  if (!value) return '';
  const next = Array.from(
    new Set(
      String(value)
        .split(',')
        .map((item) => item.trim().toLowerCase())
        .filter((item) => ALLOWED_TEST_TYPES.includes(item))
    )
  );
  return next.join(',');
}

export default function TestCenterClient({ packs }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [questionCountInput, setQuestionCountInput] = useState(String(DEFAULT_QUESTIONS));
  const [packFilter, setPackFilter] = useState('');
  const [selectedPackIds, setSelectedPackIds] = useState(() => new Set((packs || []).map((pack) => pack.id)));

  const orderedSelectedPackIds = useMemo(() => {
    const selected = selectedPackIds;
    return (packs || []).map((pack) => pack.id).filter((id) => selected.has(id));
  }, [packs, selectedPackIds]);

  const selectedCount = orderedSelectedPackIds.length;
  const selectedQuestionCount = clampQuestionCount(questionCountInput);
  const normalizedPackFilter = packFilter.trim().toLowerCase();
  const filteredPacks = useMemo(() => {
    if (!normalizedPackFilter) return packs || [];
    return (packs || []).filter((pack) => {
      const title = String(pack.title || '').toLowerCase();
      const id = String(pack.id || '').toLowerCase();
      return title.includes(normalizedPackFilter) || id.includes(normalizedPackFilter);
    });
  }, [packs, normalizedPackFilter]);

  function togglePack(id) {
    setSelectedPackIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelectedPackIds(new Set((packs || []).map((pack) => pack.id)));
  }

  function clearAll() {
    setSelectedPackIds(new Set());
  }

  function startTest() {
    if (selectedCount === 0) return;
    const params = new URLSearchParams();
    const existingQt = sanitizeQtCsv(searchParams.get('qt'));
    params.set('mode', 'test');
    params.set('n', String(clampQuestionCount(questionCountInput)));
    params.set('packs', orderedSelectedPackIds.join(','));
    params.set('random', '1');
    if (existingQt) {
      params.set('qt', existingQt);
    }
    router.push(`/test/run?${params.toString()}`);
  }

  return (
    <section className="mx-auto w-full max-w-4xl px-4 pb-10 pt-6 sm:px-6 lg:px-8">
      <header style={{ marginBottom: 16 }}>
        <h1 style={{ marginBottom: 6 }}>Exam Simulation</h1>
        <p className="muted" style={{ marginTop: 0 }}>
          Timed, exam-like conditions. No hints. Explanations at the end.
        </p>
        <ul className="muted" style={{ margin: '8px 0 0', paddingLeft: 18 }}>
          <li>Question count: set before starting ({selectedQuestionCount} selected).</li>
          <li>Timer toggle: not available on this setup screen.</li>
          <li>After finishing, review missed questions before your next run.</li>
        </ul>
      </header>

      <section id="testing-center-setup" className="runner" style={{ marginTop: 0 }}>
        <div style={{ display: 'grid', gap: 14 }}>
          <div>
            <label htmlFor="test-question-count" style={{ display: 'block', fontWeight: 600, marginBottom: 6 }}>
              Questions
            </label>
            <input
              id="test-question-count"
              type="number"
              min={MIN_QUESTIONS}
              max={MAX_QUESTIONS}
              value={questionCountInput}
              onChange={(event) => setQuestionCountInput(event.target.value)}
              onBlur={() => setQuestionCountInput(String(clampQuestionCount(questionCountInput)))}
              className="choice-btn"
              style={{ width: '100%', maxWidth: 220 }}
              inputMode="numeric"
            />
            <p className="muted" style={{ marginBottom: 0 }}>
              Default 50. Min {MIN_QUESTIONS}, max {MAX_QUESTIONS}.
            </p>
          </div>

          <div>
            <div className="button-row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div>
                <p style={{ margin: 0, fontWeight: 600 }}>Packs</p>
                <p className="muted" style={{ margin: 0 }}>
                  {selectedCount} of {(packs || []).length} selected
                </p>
              </div>
              <div className="button-row">
                <button type="button" className="choice-btn" onClick={selectAll}>
                  Select all
                </button>
                <button type="button" className="choice-btn" onClick={clearAll}>
                  Clear
                </button>
              </div>
            </div>
            <div style={{ marginBottom: 8 }}>
              <label htmlFor="test-pack-filter" className="muted" style={{ display: 'block', marginBottom: 4 }}>
                Filter packs
              </label>
              <input
                id="test-pack-filter"
                type="search"
                value={packFilter}
                onChange={(event) => setPackFilter(event.target.value)}
                className="choice-btn"
                style={{ width: '100%' }}
                placeholder="Search by pack title or id"
              />
              <p className="muted" style={{ marginBottom: 0 }}>
                Showing {filteredPacks.length} of {(packs || []).length} packs
              </p>
            </div>

            {(packs || []).length === 0 ? (
              <p className="muted" style={{ marginTop: 0 }}>
                No pack files found in `src/content/packs`.
              </p>
            ) : filteredPacks.length === 0 ? (
              <p className="muted" style={{ marginTop: 0 }}>
                No packs match that filter.
              </p>
            ) : (
              <div
                className="coverage-table-wrap"
                style={{ maxHeight: 420, border: '1px solid #e5e7eb', borderRadius: 8, padding: 8 }}
              >
                <div style={{ display: 'grid', gap: 6 }}>
                  {filteredPacks.map((pack) => (
                    <label
                      key={pack.id}
                      className="choice-btn"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        cursor: 'pointer',
                        minHeight: 44,
                        paddingTop: 8,
                        paddingBottom: 8,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={selectedPackIds.has(pack.id)}
                        onChange={() => togglePack(pack.id)}
                        style={{ width: 18, height: 18, flexShrink: 0 }}
                      />
                      <span style={{ display: 'grid', gap: 2 }}>
                        <span style={{ fontWeight: 600 }}>{pack.title || pack.id}</span>
                        {pack.title && pack.title !== pack.id ? (
                          <span className="muted" style={{ fontSize: '0.85rem' }}>
                            {pack.id}
                          </span>
                        ) : null}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="button-row" style={{ justifyContent: 'flex-end', marginTop: 4 }}>
            <button
              type="button"
              onClick={startTest}
              disabled={selectedCount === 0}
              className="choice-btn"
              style={{
                width: '100%',
                maxWidth: 280,
                minHeight: 48,
                textAlign: 'center',
                fontWeight: 700,
                background: selectedCount === 0 ? undefined : '#111827',
                color: selectedCount === 0 ? undefined : '#ffffff',
                borderColor: selectedCount === 0 ? undefined : '#111827',
              }}
            >
              Start Test
            </button>
          </div>
        </div>
      </section>
    </section>
  );
}
