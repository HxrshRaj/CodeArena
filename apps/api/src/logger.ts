type Level = "info" | "warn" | "error";

function line(level: Level, scope: string, msg: string, extra?: Record<string, unknown>): void {
  const sink = level === "error" ? console.error : console.log;
  sink(JSON.stringify({ t: new Date().toISOString(), level, scope, msg, ...extra }));
}

export function createLogger(scope: string) {
  return {
    info: (m: string, e?: Record<string, unknown>) => line("info", scope, m, e),
    warn: (m: string, e?: Record<string, unknown>) => line("warn", scope, m, e),
    error: (m: string, e?: Record<string, unknown>) => line("error", scope, m, e),
  };
}
