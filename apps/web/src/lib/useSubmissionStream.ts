"use client";

import { useEffect, useReducer, useRef } from "react";
import type {
  ReviewDto,
  ServerMessage,
  SubmissionDetail,
  SubmissionStatus,
  TestResultDto,
} from "@codearena/shared";
import { WS_URL } from "./config";

export interface StreamState {
  connection: "connecting" | "open" | "closed";
  /** Populated by the first snapshot. */
  detail: SubmissionDetail | null;
  status: SubmissionStatus | null;
  /** Deterministic per-case results, keyed by index, applied live. */
  testResults: Map<number, TestResultDto>;
  /** Advisory. Kept in its own field — never merged into status/score. */
  review: ReviewDto | null;
}

export type StreamAction =
  | { kind: "conn"; value: StreamState["connection"] }
  | { kind: "msg"; msg: ServerMessage };

export const initialStreamState: StreamState = {
  connection: "connecting",
  detail: null,
  status: null,
  testResults: new Map(),
  review: null,
};

/**
 * Pure reducer: exported (in addition to being wired into the hook below) so
 * the event-application logic — the part with actual branching to get wrong —
 * can be unit tested without a WebSocket or a DOM.
 */
export function submissionStreamReducer(state: StreamState, action: StreamAction): StreamState {
  if (action.kind === "conn") return { ...state, connection: action.value };

  const msg = action.msg;
  switch (msg.type) {
    case "snapshot": {
      const map = new Map<number, TestResultDto>();
      for (const r of msg.submission.testResults) map.set(r.index, r);
      return {
        ...state,
        detail: msg.submission,
        status: msg.submission.status,
        testResults: map,
        review: msg.submission.review,
      };
    }
    case "status":
      return { ...state, status: msg.status };
    case "test_result": {
      const map = new Map(state.testResults);
      map.set(msg.result.index, msg.result);
      return { ...state, testResults: map };
    }
    case "run_complete":
      return {
        ...state,
        status: msg.status,
        detail: state.detail
          ? {
              ...state.detail,
              status: msg.status,
              scorePct: msg.scorePct,
              testsPassed: msg.testsPassed,
              testsTotal: msg.testsTotal,
              runtimeMs: msg.runtimeMs,
            }
          : state.detail,
      };
    case "review_status":
      return {
        ...state,
        review: { ...(state.review ?? emptyReview()), status: msg.status },
      };
    case "review_ready":
      return { ...state, review: msg.review };
    default:
      return state;
  }
}

function emptyReview(): ReviewDto {
  return { status: "pending", provider: null, model: null, summary: null, findings: [], latencyMs: null };
}

/**
 * Opens a WebSocket, subscribes to one submission, and reduces the live
 * event stream into typed state. Reconnects with backoff and re-subscribes.
 */
export function useSubmissionStream(submissionId: string | null): StreamState {
  const [state, dispatch] = useReducer(submissionStreamReducer, initialStreamState);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!submissionId) return;

    let closedByUs = false;
    let retry = 0;
    let pingTimer: ReturnType<typeof setInterval> | undefined;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

    const connect = (): void => {
      dispatch({ kind: "conn", value: "connecting" });
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        retry = 0;
        dispatch({ kind: "conn", value: "open" });
        ws.send(JSON.stringify({ type: "subscribe", submissionId }));
        pingTimer = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "ping" }));
        }, 25_000);
      };

      ws.onmessage = (ev) => {
        try {
          dispatch({ kind: "msg", msg: JSON.parse(ev.data as string) as ServerMessage });
        } catch {
          /* ignore malformed frame */
        }
      };

      ws.onclose = () => {
        if (pingTimer) clearInterval(pingTimer);
        dispatch({ kind: "conn", value: "closed" });
        if (closedByUs) return;
        retry += 1;
        const delay = Math.min(1000 * 2 ** (retry - 1), 10_000);
        reconnectTimer = setTimeout(connect, delay);
      };

      ws.onerror = () => ws.close();
    };

    connect();

    return () => {
      closedByUs = true;
      if (pingTimer) clearInterval(pingTimer);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      wsRef.current?.close();
    };
  }, [submissionId]);

  return state;
}
