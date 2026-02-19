'use client';

import { useEffect, useState } from 'react';
import { getSupabaseClient } from '../../src/lib/supabaseClient';
import { useAuth } from '../../src/providers/AuthProvider';

export default function SettingsPage() {
  const { user } = useAuth();
  const [coachMode, setCoachMode] = useState('gentle');
  const [plan, setPlan] = useState('free');
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState({ type: '', message: '' });

  useEffect(() => {
    async function loadProfile() {
      const supabase = getSupabaseClient();
      if (!supabase) {
        setStatus({
          type: 'error',
          message: 'Supabase is not configured. Check NEXT_PUBLIC_* environment values.',
        });
        setLoading(false);
        return;
      }

      if (!user?.id) {
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('coach_mode, plan')
        .eq('id', user.id)
        .maybeSingle();

      if (error) {
        setStatus({ type: 'error', message: error.message });
      } else if (data) {
        setCoachMode(data.coach_mode || 'gentle');
        setPlan(data.plan || 'free');
      }

      setLoading(false);
    }

    loadProfile();
  }, [user?.id]);

  async function updateCoachMode(nextMode) {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setStatus({
        type: 'error',
        message: 'Supabase is not configured. Check NEXT_PUBLIC_* environment values.',
      });
      return;
    }
    if (!user?.id) return;
    setStatus({ type: '', message: '' });

    const { error } = await supabase
      .from('profiles')
      .update({ coach_mode: nextMode })
      .eq('id', user.id);

    if (error) {
      setStatus({ type: 'error', message: error.message });
      return;
    }

    setCoachMode(nextMode);
    setStatus({ type: 'success', message: 'Coach mode updated.' });
  }

  if (loading) {
    return <section><h1>Settings</h1><p>Loading profile...</p></section>;
  }

  return (
    <section>
      <h1>Settings</h1>
      <p>Coach mode controls feedback tone.</p>
      <div className="settings-row">
        <span>Coach mode:</span>
        <div className="button-row">
          <button
            type="button"
            className={coachMode === 'gentle' ? 'active-btn' : ''}
            onClick={() => updateCoachMode('gentle')}
          >
            Gentle
          </button>
          <button
            type="button"
            className={coachMode === 'push' ? 'active-btn' : ''}
            onClick={() => updateCoachMode('push')}
          >
            Push
          </button>
        </div>
      </div>
      <div className="settings-row">
        <span>Plan:</span>
        <strong>{plan}</strong>
      </div>
      {status.message ? (
        <p className={`status ${status.type === 'error' ? 'error' : 'success'}`}>
          {status.message}
        </p>
      ) : null}
    </section>
  );
}
