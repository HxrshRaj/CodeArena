/**
 * WebSocket gateway (raw `ws`, no framework abstraction).
 *
 * One Redis connection for the whole gateway, PSUBSCRIBEd to
 * `ws:submission:*`. Incoming events are fanned out to the sockets that
 * asked for that submission. The workers are the only publishers; the
 * gateway holds no execution logic, so it scales horizontally behind
 * Redis pub/sub.
 *
 * Per socket: on `subscribe` we register interest, send one full `snapshot`,
 * then forward every subsequent event. Events that land while the snapshot
 * query is in flight are buffered per socket and replayed right after it, so
 * a subscriber never applies a delta before its baseline.
 */
import type { Server } from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import { prisma } from "@codearena/db";
import {
  submissionChannel,
  type ClientMessage,
  type ServerMessage,
} from "@codearena/shared";
import { createSubscriber } from "./redis.js";
import { toSubmissionDetail } from "./mappers.js";
import { createLogger } from "./logger.js";

const log = createLogger("ws");

const CHANNEL_PREFIX = "ws:submission:";
const CHANNEL_PATTERN = `${CHANNEL_PREFIX}*`;

const detailInclude = {
  challenge: { include: { testCases: true } },
  testResults: true,
  review: true,
} as const;

interface SocketState {
  /** submissionIds this socket wants. */
  interest: Set<string>;
  /** true once at least one snapshot has been sent. */
  primed: boolean;
  /** events buffered until the first snapshot goes out. */
  buffer: string[];
}

export function attachWebSocket(server: Server): void {
  const wss = new WebSocketServer({ server, path: "/ws" });
  const sockets = new Map<WebSocket, SocketState>();

  // submissionId -> interested sockets
  const subscribers = new Map<string, Set<WebSocket>>();

  const gatewaySub = createSubscriber();
  void gatewaySub.psubscribe(CHANNEL_PATTERN).then(
    () => log.info("gateway pattern-subscribed", { pattern: CHANNEL_PATTERN }),
    (err: unknown) => log.error("psubscribe failed", { err: String(err) }),
  );

  gatewaySub.on("pmessage", (_pattern: string, channel: string, payload: string) => {
    const submissionId = channel.slice(CHANNEL_PREFIX.length);
    const targets = subscribers.get(submissionId);
    if (!targets) return;
    for (const ws of targets) {
      const state = sockets.get(ws);
      if (!state || ws.readyState !== WebSocket.OPEN) continue;
      if (state.primed) ws.send(payload);
      else state.buffer.push(payload);
    }
  });

  wss.on("connection", (ws) => {
    sockets.set(ws, { interest: new Set(), primed: false, buffer: [] });

    const send = (msg: ServerMessage): void => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
    };

    ws.on("message", async (raw) => {
      const state = sockets.get(ws);
      if (!state) return;

      let msg: ClientMessage;
      try {
        msg = JSON.parse(raw.toString()) as ClientMessage;
      } catch {
        send({ type: "error", message: "invalid json" });
        return;
      }

      if (msg.type === "ping") {
        send({ type: "pong" });
        return;
      }

      if (msg.type === "subscribe") {
        if (state.interest.has(msg.submissionId)) return;

        const row = await prisma.submission.findUnique({
          where: { id: msg.submissionId },
          include: detailInclude,
        });
        if (!row) {
          send({ type: "error", submissionId: msg.submissionId, message: "unknown submission" });
          return;
        }

        state.interest.add(msg.submissionId);
        let set = subscribers.get(msg.submissionId);
        if (!set) {
          set = new Set();
          subscribers.set(msg.submissionId, set);
        }
        set.add(ws);

        send({ type: "snapshot", submission: toSubmissionDetail(row) });
        if (!state.primed) {
          state.primed = true;
          const pending = state.buffer.splice(0);
          for (const p of pending) {
            if (ws.readyState === WebSocket.OPEN) ws.send(p);
          }
        }
        return;
      }

      if (msg.type === "unsubscribe") {
        if (!state.interest.delete(msg.submissionId)) return;
        subscribers.get(msg.submissionId)?.delete(ws);
      }
    });

    const cleanup = (): void => {
      const state = sockets.get(ws);
      if (state) {
        for (const id of state.interest) subscribers.get(id)?.delete(ws);
      }
      sockets.delete(ws);
    };
    ws.on("close", cleanup);
    ws.on("error", cleanup);
  });

  const heartbeat = setInterval(() => {
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) client.ping();
    }
  }, 30_000);
  wss.on("close", () => {
    clearInterval(heartbeat);
    void gatewaySub.quit().catch(() => undefined);
  });

  log.info("websocket gateway attached", { path: "/ws" });
}
