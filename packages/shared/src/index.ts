/**
 * Shared contract between the API, the workers and the web client.
 *
 * ---------------------------------------------------------------------------
 * THE CENTRAL DESIGN DECISION
 * ---------------------------------------------------------------------------
 * Deterministic signals and the LLM review are two separate layers and never
 * mix. In this file that shows up as:
 *
 *   - `SubmissionSummary` / `TestResultDto`  -> deterministic. Produced only by
 *     sandboxed execution against test cases. This is the score.
 *
 *   - `ReviewDto`                            -> advisory. Produced by an LLM.
 *     It has no field that feeds a score or a pass/fail. It can be missing,
 *     pending, or failed without affecting anything deterministic.
 *
 * The WebSocket protocol keeps them on separate message types too
 * (`status` / `test_result` / `run_complete` vs `review_status` / `review_ready`)
 * so the UI can render them in clearly distinct places.
 */

export type Language = "python";

// --- Deterministic domain ---------------------------------------------------

export type SubmissionStatus =
  | "queued"
  | "running"
  | "passed" // all test cases passed
  | "failed" // ran to completion, at least one test case did not pass
  | "error"; // could not be executed (compile error, sandbox failure, timeout of the whole run)

export type TestResultStatus = "pass" | "fail" | "error" | "timeout";

// --- Advisory (LLM) domain -----------------------------------------------------

export type ReviewStatus = "pending" | "ready" | "failed";

export type ReviewSeverity = "info" | "minor" | "major";

export interface ReviewFinding {
  severity: ReviewSeverity;
  /** Short category, e.g. "naming", "complexity", "error-handling". */
  category: string;
  comment: string;
  /** 1-based line in the submitted code, when the model anchors to one. */
  line?: number;
}

// --- REST DTOs ------------------------------------------------------------------

export interface ChallengeSummary {
  id: string;
  slug: string;
  title: string;
  language: Language;
  difficulty: "easy" | "medium" | "hard";
}

export interface PublicTestCase {
  index: number;
  name: string;
  /** Only sample cases expose their data; hidden cases show name + index only. */
  hidden: boolean;
  stdin?: string;
  expectedStdout?: string;
}

export interface ChallengeDetail extends ChallengeSummary {
  promptMarkdown: string;
  starterCode: string;
  timeLimitMs: number;
  memoryMb: number;
  testCases: PublicTestCase[];
}

export interface CreateSubmissionRequest {
  challengeId: string;
  candidateName: string;
  code: string;
}

export interface CreateSubmissionResponse {
  submissionId: string;
}

export interface TestResultDto {
  index: number;
  name: string;
  hidden: boolean;
  status: TestResultStatus;
  timeMs: number;
  /** Truncated for display; omitted for hidden cases. */
  stdoutExcerpt?: string;
  expectedExcerpt?: string;
  message?: string;
}

export interface ReviewDto {
  status: ReviewStatus;
  provider: string | null;
  model: string | null;
  summary: string | null;
  findings: ReviewFinding[];
  latencyMs: number | null;
}

export interface SubmissionSummary {
  id: string;
  challengeId: string;
  challengeTitle: string;
  candidateName: string;
  language: Language;
  status: SubmissionStatus;
  /** 0-100, weighted by test-case weight. Deterministic. */
  scorePct: number;
  testsPassed: number;
  testsTotal: number;
  runtimeMs: number | null;
  createdAt: string;
  finishedAt: string | null;
}

export interface SubmissionDetail extends SubmissionSummary {
  code: string;
  testResults: TestResultDto[];
  /** Separate object. Never folded into `scorePct` or `status`. */
  review: ReviewDto;
}

// --- WebSocket protocol -------------------------------------------------------

export interface ClientSubscribe {
  type: "subscribe";
  submissionId: string;
}
export interface ClientUnsubscribe {
  type: "unsubscribe";
  submissionId: string;
}
export interface ClientPing {
  type: "ping";
}
export type ClientMessage = ClientSubscribe | ClientUnsubscribe | ClientPing;

/** Full current state, sent once right after a successful `subscribe`. */
export interface ServerSnapshot {
  type: "snapshot";
  submission: SubmissionDetail;
}
/** Deterministic: overall submission status changed. */
export interface ServerStatus {
  type: "status";
  submissionId: string;
  status: SubmissionStatus;
}
/** Deterministic: one test case finished executing. */
export interface ServerTestResult {
  type: "test_result";
  submissionId: string;
  result: TestResultDto;
}
/** Deterministic: the run finished; carries the final score. */
export interface ServerRunComplete {
  type: "run_complete";
  submissionId: string;
  status: Extract<SubmissionStatus, "passed" | "failed" | "error">;
  scorePct: number;
  testsPassed: number;
  testsTotal: number;
  runtimeMs: number;
}
/** Advisory: LLM review changed state (queued -> pending -> ready/failed). */
export interface ServerReviewStatus {
  type: "review_status";
  submissionId: string;
  status: ReviewStatus;
}
/** Advisory: LLM review finished. */
export interface ServerReviewReady {
  type: "review_ready";
  submissionId: string;
  review: ReviewDto;
}
export interface ServerError {
  type: "error";
  submissionId?: string;
  message: string;
}
export interface ServerPong {
  type: "pong";
}

export type ServerMessage =
  | ServerSnapshot
  | ServerStatus
  | ServerTestResult
  | ServerRunComplete
  | ServerReviewStatus
  | ServerReviewReady
  | ServerError
  | ServerPong;

/**
 * Messages the workers publish onto the Redis channel `ws:submission:<id>`.
 * The API's WS gateway forwards these verbatim to subscribed sockets, so this
 * is exactly the non-snapshot, non-pong subset of `ServerMessage`.
 */
export type SubmissionEvent = Exclude<ServerMessage, ServerSnapshot | ServerPong>;

export const submissionChannel = (submissionId: string): string =>
  `ws:submission:${submissionId}`;

// --- Redis keys (single source of truth) ------------------------------------

export const redisKeys = {
  /** List. Executor workers BRPOP submission ids from here. */
  execQueue: "exec:queue",
  /** List. Review workers BRPOP submission ids from here. */
  reviewQueue: "review:queue",
  /** Set of submission ids currently executing. Drives the dashboard's "running now". */
  execRunning: "exec:running",
  /** Hash per submission: { status, queuedAt, startedAt }. */
  execState: (submissionId: string): string => `exec:state:${submissionId}`,
  /**
   * Cache-aside: public ChallengeDetail (hidden test cases carry no data).
   * This is what the API serves to the browser.
   */
  challengeCache: (id: string): string => `cache:challenge:${id}`,
  /**
   * Cache-aside: full challenge incl. every test case's stdin/expected.
   * Worker-only. Kept on a separate key so the public projection can never
   * accidentally leak hidden expected output.
   */
  challengeExecCache: (id: string): string => `cache:challenge:exec:${id}`,
  /** Cache-aside: serialized ChallengeSummary[] index. */
  challengeIndexCache: "cache:challenges:index",
} as const;

/** TTL for cached challenge data. */
export const CHALLENGE_CACHE_TTL_SECONDS = 3600;

// --- In-container runner protocol (executor worker <- runner.py) ------------

export interface RunnerCaseResult {
  kind: "case_result";
  index: number;
  name: string;
  hidden: boolean;
  status: TestResultStatus;
  timeMs: number;
  stdout: string;
  expected: string;
  message?: string;
}
export interface RunnerDone {
  kind: "done";
  total: number;
  passed: number;
}
export interface RunnerFatal {
  kind: "fatal";
  message: string;
}
export type RunnerLine = RunnerCaseResult | RunnerDone | RunnerFatal;
