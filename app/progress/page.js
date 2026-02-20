'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { getSupabaseClient } from '../../src/lib/supabaseClient';
import { getCoverageStats } from '../../src/lib/coverageStats';

export default function ProgressPage() {
  const [stats, setStats] = useState({ overallPercent: 0, rows: [] });
  const [sectionFilter, setSectionFilter] = useState('all');
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function loadStats() {
      const supabase = getSupabaseClient();
      if (!supabase) {
        setError('Supabase is not configured. Check NEXT_PUBLIC_* environment values.');
        setLoading(false);
        return;
      }

      try {
        const nextStats = await getCoverageStats(supabase);
        setStats(nextStats);
      } catch (loadError) {
        setError(loadError.message);
      }

      setLoading(false);
    }

    loadStats();
  }, []);

  const filteredRows = useMemo(() => {
    return stats.rows.filter((row) => {
      if (sectionFilter !== 'all' && row.sectionCode !== sectionFilter) return false;
      if (onlyMissing && row.status !== 'Missing') return false;
      return true;
    });
  }, [onlyMissing, sectionFilter, stats.rows]);

  return (
    <section>
      <h1>Progress</h1>
      <p data-testid="progress-stats">
        Blueprint leaf coverage: <strong>{stats.overallPercent}%</strong>
      </p>

      <div className="drill-controls">
        <label htmlFor="progress-section">Section</label>
        <select
          id="progress-section"
          value={sectionFilter}
          onChange={(event) => setSectionFilter(event.target.value)}
        >
          <option value="all">All Sections</option>
          <option value="1">1</option>
          <option value="2">2</option>
          <option value="3">3</option>
          <option value="4">4</option>
          <option value="5">5</option>
          <option value="6">6</option>
          <option value="7">7</option>
        </select>
        <label htmlFor="progress-missing">
          <input
            id="progress-missing"
            type="checkbox"
            checked={onlyMissing}
            onChange={(event) => setOnlyMissing(event.target.checked)}
          />
          Only missing
        </label>
      </div>

      {loading ? <p>Loading coverage...</p> : null}
      {error ? <p className="status error">{error}</p> : null}

      {!loading && !error ? (
        <div className="coverage-table-wrap">
          <table className="coverage-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Title Path</th>
                <th>MCQ</th>
                <th>Fill</th>
                <th>Reverse</th>
                <th>Diagram</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => (
                <tr key={row.code}>
                  <td>
                    <Link href={`/drill?code=${encodeURIComponent(row.code)}`}>{row.code}</Link>
                  </td>
                  <td>{row.titlePath}</td>
                  <td>
                    {row.counts.mcq}/{row.targets.mcq}
                  </td>
                  <td>
                    {row.counts.fill}/{row.targets.fill}
                  </td>
                  <td>
                    {row.counts.reverse}/{row.targets.reverse}
                  </td>
                  <td>
                    {row.counts.diagram}/{row.targets.diagram}
                  </td>
                  <td>
                    <span
                      className={`status-pill ${row.status === 'Complete' ? 'ok' : row.status === 'Missing' ? 'bad' : 'mid'}`}
                    >
                      {row.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
