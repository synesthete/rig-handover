import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read.js';

describe('readNight on runs/2026-10-28.jsonl', () => {
  const night = readNight('runs', '2026-10-28');

  it('finds 5 jobs and 1 bad line (the truncated last line)', () => {
    expect(night).not.toBeNull();
    expect(night?.night).toBe('2026-10-28');
    expect(night?.badLines).toBe(1);
    expect(night?.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
  });

  it('folds each job into one row', () => {
    expect(night?.rows).toEqual([
      {
        job: 'digest/render',
        owner: null,
        runs: 1,
        retries: 0,
        fails: 0,
        lastStatus: 'ok',
        lastError: null,
        firstAt: '2026-10-29T05:41:09+01:00',
        lastAt: '2026-10-29T05:41:09+01:00',
      },
      {
        job: 'fixtures/refresh',
        owner: 'rook',
        runs: 4,
        retries: 3,
        fails: 0,
        lastStatus: 'ok',
        lastError: 'upstream 503',
        firstAt: '2026-10-29T01:30:00+01:00',
        lastAt: '2026-10-29T01:37:00+01:00',
      },
      {
        job: 'lane/sync',
        owner: 'rook',
        runs: 8,
        retries: 1,
        fails: 0,
        lastStatus: 'ok',
        lastError: 'lock held',
        firstAt: '2026-10-28T23:00:06+01:00',
        lastAt: '2026-10-29T05:00:04+01:00',
      },
      {
        job: 'notes/backup',
        owner: 'lane-07',
        runs: 1,
        retries: 0,
        fails: 1,
        lastStatus: 'fail',
        lastError: 'quota exceeded',
        firstAt: '2026-10-29T04:00:01+01:00',
        lastAt: '2026-10-29T04:00:01+01:00',
      },
      {
        job: 'rig/rotate-logs',
        owner: 'lane-07',
        runs: 1,
        retries: 0,
        fails: 0,
        lastStatus: 'ok',
        lastError: null,
        firstAt: '2026-10-28T23:00:02+01:00',
        lastAt: '2026-10-28T23:00:02+01:00',
      },
    ]);
  });
});

describe('readNight on a temp runs dir', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rig-digest-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });
  const write = (night: string, lines: string[]) =>
    writeFileSync(join(dir, `${night}.jsonl`), lines.join('\n'));
  const line = (fields: Record<string, unknown>) => JSON.stringify(fields);

  it('returns null when there is no file for the night', () => {
    expect(readNight(dir, '2026-01-01')).toBeNull();
  });

  it('returns null when the runs dir does not exist', () => {
    expect(readNight(join(dir, 'missing'), '2026-01-01')).toBeNull();
  });

  it('returns null for a night that is not YYYY-MM-DD, even if a file matches', () => {
    writeFileSync(join(dir, 'latest.jsonl'), '');
    mkdirSync(join(dir, 'sub'));
    writeFileSync(join(dir, 'sub', '2026-01-01.jsonl'), '');
    expect(readNight(dir, 'latest')).toBeNull();
    expect(readNight(dir, '2026-1-1')).toBeNull();
    expect(readNight(dir, 'sub/2026-01-01')).toBeNull();
    expect(readNight(join(dir, 'sub', 'x'), '../2026-01-01')).toBeNull();
  });

  it('reads an empty file as zero rows and zero bad lines', () => {
    write('2026-01-01', []);
    expect(readNight(dir, '2026-01-01')).toEqual({ night: '2026-01-01', rows: [], badLines: 0 });
  });

  it('skips blank lines without counting them', () => {
    write('2026-01-01', ['', line({ at: 't1', job: 'a', status: 'ok', owner: 'x' }), '   ', '\r', '']);
    const night = readNight(dir, '2026-01-01');
    expect(night?.badLines).toBe(0);
    expect(night?.rows).toHaveLength(1);
  });

  it('counts valid JSON with bad fields as bad lines', () => {
    write('2026-01-01', [
      line({ at: 't1', job: 'a', status: 'done', owner: 'x' }),
      line({ at: 't1', job: 'a', status: 'ok' }),
      line({ at: 't1', job: 'a', status: 'ok', owner: 7 }),
      line({ at: 1, job: 'a', status: 'ok', owner: 'x' }),
      line({ at: 't1', status: 'ok', owner: 'x' }),
      '[1,2]',
      'null',
      '"text"',
      line({ at: 't2', job: 'a', status: 'ok', owner: 'x' }),
    ]);
    const night = readNight(dir, '2026-01-01');
    expect(night?.badLines).toBe(8);
    expect(night?.rows).toHaveLength(1);
    expect(night?.rows[0]?.runs).toBe(1);
  });

  it('takes owner and status from the last line and keeps the latest error after a success', () => {
    write('2026-01-01', [
      line({ at: 't1', job: 'a', status: 'retry', owner: 'x', error: 'first' }),
      line({ at: 't2', job: 'a', status: 'fail', owner: 'x', error: 'second' }),
      line({ at: 't3', job: 'a', status: 'ok', owner: null }),
    ]);
    expect(readNight(dir, '2026-01-01')?.rows[0]).toMatchObject({
      owner: null,
      runs: 3,
      retries: 1,
      fails: 1,
      lastStatus: 'ok',
      lastError: 'second',
      firstAt: 't1',
      lastAt: 't3',
    });
  });

  it('sorts rows by job in plain string order', () => {
    write(
      '2026-01-01',
      ['b', 'a/z', 'B', 'a'].map((job) => line({ at: 't', job, status: 'ok', owner: null })),
    );
    expect(readNight(dir, '2026-01-01')?.rows.map((r) => r.job)).toEqual(['B', 'a', 'a/z', 'b']);
  });
});
