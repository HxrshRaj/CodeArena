type Level = "info" | "warn" | "error";

function line(level: Level, scope: string, msg: string, extra?: Record<string, unknown>): void {
  const payload = {
    t: new Date().toISOString(),
    level,
    scope,
    msg,
    ...extra,
  };
  const sink = level === "error" ? console.error : console.log;
  sink(JSON.stringify(payload));
}

export function createLogger(scope: string) {
  return {
    info: (msg: string, extra?: Record<string, unknown>) => line("info", scope, msg, extra),
    warn: (msg: string, extra?: Record<string, unknown>) => line("warn", scope, msg, extra),
    error: (msg: string, extra?: Record<string, unknown>) => line("error", scope, msg, extra),
  };
}
