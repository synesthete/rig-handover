import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

type Row = {
  job: string;
  owner: string | null;
  runs: number;
  retries: number;
  fails: number;
  lastStatus: string;
  lastError: string | null;
  firstAt: string;
  lastAt: string;
};
type DigestJson = { night: string; rows: Row[]; badLines: number };

let runsDir: string;
let baseConfig: { adapter: string; installed: string; beatEverySeconds: number; runsDir: string };

const line = (job: string, status: string, owner: string | null, at: string, error?: string) =>
  JSON.stringify({ at, job, status, owner, ...(error ? { error } : {}) });

beforeAll(() => {
  runsDir = mkdtempSync(join(tmpdir(), 'rig-digest-test-'));
  baseConfig = {
    adapter: 'shim',
    installed: '2026-10-29T14:06:00+01:00',
    beatEverySeconds: 60,
    runsDir,
  };

  // Two jobs; lane/sync is written first so the file order differs from the job order.
  writeFileSync(
    join(runsDir, '2026-01-01.jsonl'),
    [
      line('lane/sync', 'ok', 'lane', '2026-01-01T02:00:00+01:00'),
      line('lane/backup', 'retry', null, '2026-01-01T03:00:00+01:00', 'upstream 503'),
      line('lane/backup', 'retry', null, '2026-01-01T03:10:00+01:00', 'upstream 503'),
      line('lane/backup', 'retry', null, '2026-01-01T03:20:00+01:00', 'upstream 503'),
      line('lane/backup', 'ok', null, '2026-01-01T03:30:00+01:00'),
      '',
    ].join('\n'),
  );

  // Empty file: the night ran nothing.
  writeFileSync(join(runsDir, '2026-01-02.jsonl'), '');

  // Two good lines and one truncated line.
  writeFileSync(
    join(runsDir, '2026-01-03.jsonl'),
    [
      line('lane/sync', 'ok', 'lane', '2026-01-03T02:00:00+01:00'),
      '{"at":',
      line('lane/backup', 'ok', null, '2026-01-03T03:00:00+01:00'),
      '',
    ].join('\n'),
  );
});

afterAll(() => {
  rmSync(runsDir, { recursive: true, force: true });
});

const app = () => createApp({ ...baseConfig, runsDir });

describe('GET /digest/:night', () => {
  it('renders 200 with the jobs of a night that has a file', async () => {
    const res = await app().request('/digest/2026-01-01');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('lane/sync');
    expect(html).toContain('lane/backup');
  });

  it('returns 404 for a night with no file', async () => {
    const res = await app().request('/digest/2026-01-09');
    expect(res.status).toBe(404);
  });

  it('says "nothing ran" for an empty night', async () => {
    const res = await app().request('/digest/2026-01-02');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('nothing ran');
  });

  it('still renders a night with a bad line and says it could not be read', async () => {
    const res = await app().request('/digest/2026-01-03');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('lane/sync');
    expect(html).toContain('could not be read');
  });
});

describe('GET /api/digest/:night', () => {
  it('returns 200 with rows in job order, with runs and retries', async () => {
    const res = await app().request('/api/digest/2026-01-01');
    expect(res.status).toBe(200);
    const body = (await res.json()) as DigestJson;
    expect(body.night).toBe('2026-01-01');
    expect(body.rows.map((r) => r.job)).toEqual(['lane/backup', 'lane/sync']);

    const backup = body.rows[0];
    expect(backup.runs).toBe(4);
    expect(backup.retries).toBe(3);

    const sync = body.rows[1];
    expect(sync.runs).toBe(1);
    expect(sync.retries).toBe(0);
  });

  it('returns 404 JSON for a night with no file', async () => {
    const res = await app().request('/api/digest/2026-01-09');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'no run log for 2026-01-09' });
  });

  it('returns empty rows for the empty night', async () => {
    const res = await app().request('/api/digest/2026-01-02');
    expect(res.status).toBe(200);
    const body = (await res.json()) as DigestJson;
    expect(body.rows).toEqual([]);
  });

  it('counts the bad line and still returns the good rows', async () => {
    const res = await app().request('/api/digest/2026-01-03');
    expect(res.status).toBe(200);
    const body = (await res.json()) as DigestJson;
    expect(body.badLines).toBe(1);
    expect(body.rows.map((r) => r.job)).toEqual(['lane/backup', 'lane/sync']);
  });
});

describe('page and JSON agree', () => {
  it('list the same jobs in the same order for 2026-01-01', async () => {
    const page = await app().request('/digest/2026-01-01');
    const html = await page.text();
    const api = await app().request('/api/digest/2026-01-01');
    const body = (await api.json()) as DigestJson;

    const jobs = body.rows.map((r) => r.job);
    const positions = jobs.map((job) => html.indexOf(job));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });
});
