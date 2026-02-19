'use client';

import { useEffect, useState } from 'react';
import QuestionRunner from '../_components/QuestionRunner';
import { getSupabaseClient } from '../../src/lib/supabaseClient';

function shuffle(items) {
  const list = [...items];
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

export default function DrillPage() {
  const [domains, setDomains] = useState([]);
  const [domain, setDomain] = useState('');
  const [questions, setQuestions] = useState([]);
  const [loadingDomains, setLoadingDomains] = useState(true);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [error, setError] = useState('');
  const [started, setStarted] = useState(false);

  useEffect(() => {
    async function loadDomains() {
      const supabase = getSupabaseClient();
      if (!supabase) {
        setError('Supabase is not configured. Check NEXT_PUBLIC_* environment values.');
        setLoadingDomains(false);
        return;
      }

      const { data, error: domainError } = await supabase
        .from('questions')
        .select('domain')
        .limit(200);

      if (domainError) {
        setError(domainError.message);
        setLoadingDomains(false);
        return;
      }

      const uniqueDomains = Array.from(new Set((data || []).map((row) => row.domain))).sort();
      setDomains(uniqueDomains);
      setDomain(uniqueDomains[0] || '');
      setLoadingDomains(false);
    }

    loadDomains();
  }, []);

  async function startDrill() {
    if (!domain) return;

    const supabase = getSupabaseClient();
    if (!supabase) {
      setError('Supabase is not configured. Check NEXT_PUBLIC_* environment values.');
      return;
    }

    setLoadingQuestions(true);
    setError('');

    const { data, error: questionError } = await supabase
      .from('questions')
      .select('id,domain,subtopic,prompt,choices,correct_index,explanation,difficulty')
      .eq('domain', domain)
      .limit(40);

    if (questionError) {
      setError(questionError.message);
      setLoadingQuestions(false);
      return;
    }

    setQuestions(shuffle(data || []).slice(0, 10));
    setStarted(true);
    setLoadingQuestions(false);
  }

  return (
    <section>
      <h1>Drill</h1>
      <p>Pick a domain and run a focused set of 10 questions.</p>

      {loadingDomains ? <p>Loading domains...</p> : null}
      {error ? <p className="status error">{error}</p> : null}

      {!loadingDomains ? (
        <div className="drill-controls">
          <label htmlFor="drill-domain">Domain</label>
          <select
            id="drill-domain"
            value={domain}
            onChange={(event) => setDomain(event.target.value)}
            disabled={loadingQuestions}
          >
            {domains.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
          <button type="button" onClick={startDrill} disabled={loadingQuestions || !domain}>
            {loadingQuestions ? 'Loading...' : 'Start Drill'}
          </button>
        </div>
      ) : null}

      {started && !loadingQuestions ? (
        <QuestionRunner title={`Drill: ${domain}`} questions={questions} />
      ) : null}
    </section>
  );
}
