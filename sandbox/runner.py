"""In-container test runner.

Invoked as:  python -I -B /app/runner.py <job.json> <submission.py>

Runs each test case as its own short-lived subprocess, one at a time, and
prints exactly one JSON line per case to stdout, flushing immediately. The
executor worker reads those lines as they appear and turns each into a
WebSocket event. That is what makes result streaming real rather than a
single delayed blob.

Output protocol (one JSON object per line):
  {"kind": "case_result", "index", "name", "hidden", "status", "timeMs",
   "stdout", "expected", "message"}
  {"kind": "done", "total", "passed"}
  {"kind": "fatal", "message"}

status is one of: pass | fail | error | timeout
"""
from __future__ import annotations

import json
import subprocess
import sys
import time

MAX_FIELD = 4000  # cap stdout / expected in the payload


def emit(obj: dict) -> None:
    sys.stdout.write(json.dumps(obj) + "\n")
    sys.stdout.flush()


def normalize(text: str) -> str:
    """Trailing-whitespace-insensitive line comparison."""
    lines = [line.rstrip() for line in text.replace("\r\n", "\n").split("\n")]
    while lines and lines[-1] == "":
        lines.pop()
    return "\n".join(lines)


def clip(text: str) -> str:
    return text if len(text) <= MAX_FIELD else text[:MAX_FIELD] + "\n...[truncated]"


def main() -> int:
    if len(sys.argv) != 3:
        emit({"kind": "fatal", "message": "usage: runner.py <job.json> <submission.py>"})
        return 2

    job_path, submission_path = sys.argv[1], sys.argv[2]

    try:
        with open(job_path, "r", encoding="utf-8") as fh:
            job = json.load(fh)
        cases = job["cases"]
        per_case_timeout = max(0.1, float(job["timeLimitMs"]) / 1000.0)
    except Exception as exc:  # noqa: BLE001 - report anything and stop
        emit({"kind": "fatal", "message": f"bad job file: {exc!r}"})
        return 2

    passed = 0
    for case in cases:
        stdin_data = case.get("stdin", "")
        expected = case.get("expectedStdout", "")
        started = time.perf_counter()
        status = "pass"
        message = ""
        actual = ""

        try:
            proc = subprocess.run(
                [sys.executable, "-I", "-B", submission_path],
                input=stdin_data,
                capture_output=True,
                text=True,
                timeout=per_case_timeout,
            )
            actual = proc.stdout
            if proc.returncode != 0:
                status = "error"
                stderr_tail = proc.stderr.strip().splitlines()[-3:]
                message = " / ".join(stderr_tail) or f"exit code {proc.returncode}"
            elif normalize(actual) == normalize(expected):
                status = "pass"
            else:
                status = "fail"
        except subprocess.TimeoutExpired:
            status = "timeout"
            message = f"exceeded {per_case_timeout:.2f}s"
        except Exception as exc:  # noqa: BLE001
            status = "error"
            message = repr(exc)

        elapsed_ms = int((time.perf_counter() - started) * 1000)
        if status == "pass":
            passed += 1

        emit(
            {
                "kind": "case_result",
                "index": case["index"],
                "name": case["name"],
                "hidden": bool(case.get("hidden", False)),
                "status": status,
                "timeMs": elapsed_ms,
                "stdout": clip(actual),
                "expected": clip(expected),
                "message": message,
            }
        )

    emit({"kind": "done", "total": len(cases), "passed": passed})
    return 0


if __name__ == "__main__":
    sys.exit(main())
