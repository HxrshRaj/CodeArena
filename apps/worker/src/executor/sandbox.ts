/**
 * The security-sensitive core: run untrusted candidate code inside a
 * throwaway Docker container and stream per-test-case results back out.
 *
 * Isolation applied to every run:
 *   --network=none            no network access at all
 *   --memory / --memory-swap  hard RAM cap, swap disabled
 *   --cpus                    CPU quota
 *   --pids-limit              fork-bomb ceiling
 *   --cap-drop=ALL            drop every Linux capability
 *   --security-opt no-new-privileges
 *   --read-only               immutable root filesystem
 *   --tmpfs /tmp (noexec)     small writable scratch only
 *   --user 65534:65534        run as `nobody`
 *   --ulimit cpu / nofile     secondary CPU-seconds and fd caps
 *   -v <jobdir>:/sandbox:ro   the only mount, read-only
 *   --rm                      container is deleted on exit
 * plus an outer wall-clock budget enforced by the worker; on breach the
 * container is `docker kill`ed.
 *
 * This is Docker-level isolation (shared kernel). gVisor / Firecracker /
 * a dedicated microVM would be the next step for a hostile production
 * workload — see README "Security model".
 */
import { execa, type ExecaError, type ResultPromise } from "execa";
import { randomUUID } from "node:crypto";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import type { RunnerCaseResult, RunnerDone, RunnerLine } from "@codearena/shared";
import { config } from "../config.js";
import { createLogger } from "../logger.js";

const log = createLogger("sandbox");

export interface SandboxCase {
  index: number;
  name: string;
  hidden: boolean;
  stdin: string;
  expectedStdout: string;
}

export interface SandboxJob {
  /** Only used to label the container. */
  submissionId: string;
  code: string;
  timeLimitMs: number;
  cases: SandboxCase[];
}

export interface SandboxOutcome {
  caseResults: RunnerCaseResult[];
  done: RunnerDone | null;
  /** Non-null means the run could not be trusted end to end. */
  fatal: string | null;
  wallMs: number;
}

/**
 * Windows/Docker Desktop: os.tmpdir() lives under the user profile, which is
 * bind-mounted into the Docker VM by default. Override with SANDBOX_TMP_DIR if
 * your temp dir is on a path Docker Desktop does not share.
 */
const HOST_TMP_ROOT = process.env.SANDBOX_TMP_DIR ?? tmpdir();

export async function runSandbox(
  job: SandboxJob,
  onCaseResult: (r: RunnerCaseResult) => void,
): Promise<SandboxOutcome> {
  const workdir = await mkdtemp(join(HOST_TMP_ROOT, "codearena-exec-"));
  const containerName = `codearena-exec-${job.submissionId.slice(0, 12)}-${randomUUID().slice(0, 8)}`;

  const jobFile = {
    timeLimitMs: job.timeLimitMs,
    cases: job.cases.map((c) => ({
      index: c.index,
      name: c.name,
      hidden: c.hidden,
      stdin: c.stdin,
      expectedStdout: c.expectedStdout,
    })),
  };

  await writeFile(join(workdir, "submission.py"), job.code, "utf8");
  await writeFile(join(workdir, "job.json"), JSON.stringify(jobFile), "utf8");

  // The sandbox container runs as `nobody` (uid 65534) and mounts this dir
  // read-only. mkdtemp creates it 0700/owner-only, so on a real Linux host
  // (e.g. the fully containerised stack) nobody can't read it — widen to
  // world-readable. The contents are just the candidate's own code + inputs.
  await chmod(workdir, 0o755);
  await chmod(join(workdir, "submission.py"), 0o644);
  await chmod(join(workdir, "job.json"), 0o644);

  // Each case may burn its full per-case timeout; add fixed overhead headroom.
  const wallBudgetMs = job.timeLimitMs * Math.max(1, job.cases.length) + 15_000;

  const dockerArgs = [
    "run",
    "--rm",
    "--name",
    containerName,
    "--network=none",
    `--memory=${config.SANDBOX_MEMORY_MB}m`,
    `--memory-swap=${config.SANDBOX_MEMORY_MB}m`,
    `--cpus=${config.SANDBOX_CPUS}`,
    `--pids-limit=${config.SANDBOX_PIDS_LIMIT}`,
    "--cap-drop=ALL",
    "--security-opt=no-new-privileges",
    "--read-only",
    "--tmpfs",
    "/tmp:rw,noexec,nosuid,size=16m",
    "--user",
    "65534:65534",
    "--ulimit",
    "cpu=15",
    "--ulimit",
    "nofile=256:256",
    "-v",
    `${workdir}:/sandbox:ro`,
    config.SANDBOX_IMAGE,
    "/sandbox/job.json",
    "/sandbox/submission.py",
  ];

  const started = Date.now();
  const caseResults: RunnerCaseResult[] = [];
  let done: RunnerDone | null = null;
  let fatal: string | null = null;
  let stderr = "";

  const child: ResultPromise = execa("docker", dockerArgs, {
    timeout: wallBudgetMs,
    buffer: false,
  });

  if (child.stdout) {
    const rl = createInterface({ input: child.stdout });
    rl.on("line", (raw) => {
      const text = raw.trim();
      if (!text) return;
      let parsed: RunnerLine;
      try {
        parsed = JSON.parse(text) as RunnerLine;
      } catch {
        log.warn("unparseable runner line", { text: text.slice(0, 200) });
        return;
      }
      if (parsed.kind === "case_result") {
        caseResults.push(parsed);
        onCaseResult(parsed);
      } else if (parsed.kind === "done") {
        done = parsed;
      } else if (parsed.kind === "fatal") {
        fatal = parsed.message;
      }
    });
  }
  child.stderr?.on("data", (d: Buffer) => {
    stderr += d.toString();
  });

  let timedOut = false;
  let exitCode: number | undefined;
  try {
    const res = await child;
    exitCode = res.exitCode;
  } catch (err) {
    const e = err as ExecaError;
    timedOut = e.timedOut === true;
    exitCode = typeof e.exitCode === "number" ? e.exitCode : undefined;
    if (!timedOut) stderr += `\n${e.shortMessage ?? e.message}`;
  }

  const wallMs = Date.now() - started;

  if (timedOut) {
    fatal ??= `sandbox exceeded wall-clock budget of ${wallBudgetMs}ms`;
    await execa("docker", ["kill", containerName], { reject: false });
  } else if (!done && !fatal && exitCode !== 0) {
    fatal = `sandbox exited ${exitCode ?? "?"}: ${stderr.trim().slice(-500)}`;
  }

  await rm(workdir, { recursive: true, force: true }).catch(() => undefined);

  return { caseResults, done, fatal, wallMs };
}
