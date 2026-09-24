import test from 'node:test';
import assert from 'node:assert/strict';

test('adds nullable birth date without changing legacy users; migration is repeatable', async () => {
  process.env.DB_PATH = ':memory:';
  const { db, initSchema } = await import('./db.js');
  try {
    initSchema();
    db.exec('ALTER TABLE users DROP COLUMN birth_date');
    db.prepare("INSERT INTO users (name, cpf, password_hash, role, phone) VALUES (?, ?, ?, ?, ?)")
      .run('Usuário anterior', '00000000000', 'existing-hash', 'tutor', '21999999999');
    const before = { ...db.prepare('SELECT * FROM users').get() };
    initSchema();
    initSchema();
    const { birth_date, ...after } = db.prepare('SELECT * FROM users').get();
    assert.equal(birth_date, null);
    assert.deepEqual(after, before);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM users').get().n, 1);
    db.prepare('UPDATE users SET birth_date = ?').run('2000-09-24');
    initSchema();
    assert.equal(db.prepare('SELECT birth_date FROM users').get().birth_date, '2000-09-24');
  } finally { db.close(); }
});
