import test from 'node:test';
import assert from 'node:assert/strict';
import { toPostgresQuery } from '../src/persistence/db.mjs';

test('translates positional repository placeholders for PostgreSQL', () => {
  assert.equal(
    toPostgresQuery('SELECT * FROM planned_sessions WHERE athlete_id=? AND id=?'),
    'SELECT * FROM planned_sessions WHERE athlete_id=$1 AND id=$2'
  );
});

test('does not translate question marks inside quoted SQL text or identifiers', () => {
  assert.equal(
    toPostgresQuery(`SELECT '?' AS literal, "column?" FROM example WHERE id=?`),
    `SELECT '?' AS literal, "column?" FROM example WHERE id=$1`
  );
});

test('does not translate question marks inside SQL comments', () => {
  assert.equal(
    toPostgresQuery('SELECT * FROM example -- ? comment\nWHERE id=? /* ? block */ AND value=?'),
    'SELECT * FROM example -- ? comment\nWHERE id=$1 /* ? block */ AND value=$2'
  );
});
