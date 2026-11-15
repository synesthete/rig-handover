// Morning digest contract (plan morning-digest § 1). The reader in src/digest/ implements
// ReadNight; the page, the JSON route and the board link only ever see these types.

/** Status of one run, as written in the log's `status` field. */
export type RunStatus = 'ok' | 'retry' | 'fail';

/**
 * One parsed line of `runs/<night>.jsonl`. A line that is not valid JSON, or lacks a string
 * `at` / `job`, a valid `status`, or an `owner` that is a string or null, is a bad line: it is
 * counted in `DigestNight.badLines` and otherwise ignored, never thrown.
 */
export type RunLine = {
  at: string;
  job: string;
  status: RunStatus;
  owner: string | null;
  error?: string;
};

/** One job's night, folded from all of its good lines, taken in file order. */
export type DigestRow = {
  /** Job name, e.g. `lane/sync`. Unique within a night. */
  job: string;
  /** Owner from the job's last line; `null` is kept as a row (rendered as `—`). */
  owner: string | null;
  /** Number of good lines for this job (every status counts). */
  runs: number;
  /** Number of good lines for this job with status `retry`. */
  retries: number;
  /** Number of good lines for this job with status `fail`. ok lines = runs − retries − fails. */
  fails: number;
  /** Status of the job's last line. */
  lastStatus: RunStatus;
  /**
   * The most recent `error` written for this job, even if a later line succeeded
   * (e.g. retries with "upstream 503" then ok); `null` if no line for this job had one.
   */
  lastError: string | null;
  /** `at` of the job's first line, exactly as written (offset kept, never converted to UTC). */
  firstAt: string;
  /** `at` of the job's last line, exactly as written (offset kept, never converted to UTC). */
  lastAt: string;
};

/** Everything the digest knows about one night. */
export type DigestNight = {
  /** The night asked for, `YYYY-MM-DD`. */
  night: string;
  /** One row per job, sorted by `job` (plain string order). The reader sorts; callers don't. */
  rows: DigestRow[];
  /** Lines that did not parse (blank lines are skipped, not counted). */
  badLines: number;
};

/**
 * Reads `<runsDir>/<night>.jsonl`.
 * - `null`: no file for that night, or `night` is not `YYYY-MM-DD` (routes answer 404).
 * - Empty file: `{ night, rows: [], badLines: 0 }` (the page shows "nothing ran").
 * - Never throws on bad lines; they are counted in `badLines`.
 */
export type ReadNight = (runsDir: string, night: string) => DigestNight | null;
