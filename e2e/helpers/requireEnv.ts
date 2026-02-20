type RequireEnvOptions = {
  allowSkipEnvKey?: string;
};

type RequireEnvResult = {
  mode: 'ok' | 'skip';
  missing: string[];
};

export function requireEnv(
  keys: string[],
  { allowSkipEnvKey = 'E2E_ALLOW_SKIP' }: RequireEnvOptions = {}
): RequireEnvResult {
  const missing = keys.filter((key) => {
    const value = process.env[key];
    return !value || !String(value).trim();
  });

  if (missing.length === 0) {
    return { mode: 'ok', missing: [] };
  }

  if (process.env[allowSkipEnvKey] === '1') {
    return { mode: 'skip', missing };
  }

  throw new Error(
    [
      `Missing required E2E env vars: ${missing.join(', ')}`,
      'Set these vars before running e2e.',
      `If you intentionally want skips, set ${allowSkipEnvKey}=1.`,
    ].join(' ')
  );
}
