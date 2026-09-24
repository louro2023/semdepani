const settingKey = 'public_release_countdown_enabled';

export function countdownEnabled(db) {
  return db.prepare('SELECT value FROM settings WHERE key = ?').get(settingKey)?.value !== '0';
}

export function setCountdownEnabled(db, enabled) {
  if (typeof enabled !== 'boolean') {
    const error = new Error('Informe se o cronômetro deve ficar ativado ou desativado.');
    error.status = 400;
    throw error;
  }
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(settingKey, enabled ? '1' : '0');
}

export function publicReleaseCountdown(db, now = new Date()) {
  const enabled = countdownEnabled(db);
  const result = { enabled, releaseAt: null, serverNow: now.toISOString() };
  if (!enabled) return result;

  // Publication timestamps use the same server-local time as the existing release flow.
  // Follow scheduled publications shown in administration, independently of booking eligibility.
  const next = db.prepare(`
    SELECT strftime('%Y-%m-%dT%H:%M:%SZ', r.release_at, 'utc') AS releaseAt
    FROM slot_release_months r
    WHERE datetime(r.release_at) > datetime(?, 'localtime')
      AND EXISTS (
        SELECT 1 FROM slots s
        WHERE substr(s.date, 1, 7) = r.month
      )
    ORDER BY datetime(r.release_at) ASC, r.month ASC
    LIMIT 1
  `).get(now.toISOString());
  return { ...result, releaseAt: next?.releaseAt || null };
}
