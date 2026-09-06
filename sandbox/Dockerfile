# Sandbox image for executing untrusted candidate Python.
#
# This image is deliberately minimal. It contains the runner and a Python
# interpreter and nothing else. All meaningful isolation is applied at
# `docker run` time by the executor worker (see apps/worker/src/executor/sandbox.ts):
# --network=none, --cap-drop=ALL, --read-only, --pids-limit, --memory, --cpus,
# a non-root user, and a read-only mount of the job directory.

FROM python:3.12-slim

# A non-root user. `docker run --user 65534` is also passed at runtime; this is
# defence in depth in case that flag is ever dropped.
RUN useradd --uid 65532 --create-home --shell /usr/sbin/nologin runner

# The runner is baked in, not mounted, so a submission can never replace it.
COPY runner.py /app/runner.py
RUN chmod 0444 /app/runner.py

USER runner
WORKDIR /app

# Never write .pyc, never buffer stdout (streaming depends on it), no site
# packages, isolated mode.
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

ENTRYPOINT ["python", "-I", "-B", "/app/runner.py"]
