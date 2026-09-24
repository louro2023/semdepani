import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { countdownEnabled, setCountdownEnabled, publicReleaseCountdown } from './release-countdown.js';

function fixture(t) {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  db.exec(`
    CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE slot_release_months (month TEXT PRIMARY KEY, release_at TEXT NOT NULL);
    CREATE TABLE clinics (id INTEGER PRIMARY KEY, active INTEGER);
    CREATE TABLE slots (date TEXT, time TEXT, clinic_id INTEGER, active INTEGER, total_quantity INTEGER, occupied_quantity INTEGER);
    INSERT INTO clinics VALUES (1, 1);
    INSERT INTO slot_release_months VALUES ('2030-10', '2030-09-12 10:00:00'), ('2030-09', '2030-09-11 10:00:00');
    INSERT INTO slots VALUES ('2030-09-20', '09:00', 1, 1, 10, 0), ('2030-10-20', '09:00', 1, 1, 10, 0);
  `);
  return db;
}
const now = new Date(2030, 8, 10, 9);
const firstRelease = new Date(2030, 8, 11, 10).toISOString().replace('.000Z', 'Z');
const secondRelease = new Date(2030, 8, 12, 10).toISOString().replace('.000Z', 'Z');

test('uses earliest future publication, returns an unambiguous UTC timestamp and server clock', t => {
  const db = fixture(t);
  assert.deepEqual(publicReleaseCountdown(db, now), { enabled: true, releaseAt: firstRelease, serverNow: now.toISOString() });
  assert.equal(publicReleaseCountdown(db, new Date(2030, 8, 11, 10)).releaseAt, secondRelease);
  assert.equal(publicReleaseCountdown(db, new Date(2030, 8, 12, 10)).releaseAt, null);
});

test('enable/disable persists without changing scheduled publication', t => {
  const db = fixture(t);
  setCountdownEnabled(db, false);
  assert.equal(countdownEnabled(db), false);
  assert.equal(publicReleaseCountdown(db, now).releaseAt, null);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM slot_release_months').get().n, 2);
  setCountdownEnabled(db, true);
  assert.equal(publicReleaseCountdown(db, now).releaseAt, firstRelease);
  assert.throws(() => setCountdownEnabled(db, 'false'), { status: 400 });
  assert.equal(countdownEnabled(db), true);
});

test('scheduled publication remains visible regardless of booking eligibility', t => {
  const db = fixture(t);
  db.exec("UPDATE slots SET occupied_quantity = total_quantity WHERE date LIKE '2030-09%'");
  assert.equal(publicReleaseCountdown(db, now).releaseAt, firstRelease);
  db.exec('UPDATE clinics SET active = 0');
  assert.equal(publicReleaseCountdown(db, now).releaseAt, firstRelease);
  db.exec('UPDATE clinics SET active = 1; UPDATE slots SET active = 0');
  assert.equal(publicReleaseCountdown(db, now).releaseAt, firstRelease);
  // Regression: publication at 11:50, appointment at 09:00 on the same date.
  db.exec("UPDATE slots SET active = 1; UPDATE slots SET date = '2030-10-10', time = '09:00'; DELETE FROM slot_release_months WHERE month = '2030-09'; UPDATE slot_release_months SET release_at = '2030-10-10 11:50:00'");
  assert.equal(publicReleaseCountdown(db, now).releaseAt, new Date(2030, 9, 10, 11, 50).toISOString().replace('.000Z', 'Z'));
  db.exec('DELETE FROM slots');
  assert.equal(publicReleaseCountdown(db, now).releaseAt, null);
});

test('updates target after rescheduling or hiding the next publication', t => {
  const db = fixture(t);
  db.exec("UPDATE slot_release_months SET release_at = '2030-09-13 10:00:00' WHERE month = '2030-09'");
  assert.equal(publicReleaseCountdown(db, now).releaseAt, secondRelease);
  db.exec("DELETE FROM slot_release_months WHERE month = '2030-10'");
  assert.equal(publicReleaseCountdown(db, now).releaseAt, new Date(2030, 8, 13, 10).toISOString().replace('.000Z', 'Z'));
  db.exec('DELETE FROM slot_release_months');
  assert.equal(publicReleaseCountdown(db, now).releaseAt, null);
});
