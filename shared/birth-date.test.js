import test from 'node:test';
import assert from 'node:assert/strict';
import { validateBirthDate } from './birth-date.js';

const today = new Date('2026-09-24T15:00:00Z');
test('accepts exactly 18 years, rejects one day short and younger applicants', () => {
  assert.equal(validateBirthDate('24/09/2008', today).birthDate, '2008-09-24');
  assert.equal(validateBirthDate('2008-09-23', today).error, '');
  assert.match(validateBirthDate('25/09/2008', today).error, /18 anos/);
  assert.match(validateBirthDate('2015-01-01', today).error, /18 anos/);
});
test('rejects missing, malformed, impossible and future dates', () => {
  for (const value of ['', null, 20080101, '1/1/2000', '2000-13-01', '2001-02-29', '2000-04-31', '0000-01-01', '2027-01-01']) {
    assert.ok(validateBirthDate(value, today).error, String(value));
  }
  assert.equal(validateBirthDate('2000-02-29', today).error, '');
});
test('birthday boundary follows Brasilia even when UTC date has already changed', () => {
  assert.match(validateBirthDate('2008-09-24', new Date('2026-09-24T02:59:59Z')).error, /18 anos/);
  assert.equal(validateBirthDate('2008-09-24', new Date('2026-09-24T03:00:00Z')).error, '');
  assert.match(validateBirthDate('2008-02-29', new Date('2026-02-28T15:00:00Z')).error, /18 anos/);
  assert.equal(validateBirthDate('2008-02-29', new Date('2026-03-01T15:00:00Z')).error, '');
});
