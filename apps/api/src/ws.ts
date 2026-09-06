/**
 * WebSocket gateway (raw `ws`, no framework abstraction).
 *
 * Flow: client connects to /ws, sends `{type:"subscribe",submissionId}`.
 * The gateway SUBSCRIBEs the Redis channel `ws:submission:<id>`, sends a
 * one-off full `snapshot`, then forwards every published event live. The
 * workers are the only publishers; the gateway holds no execution logic and
 * no in-memory run state, so it scales horizontally behind Redis pub/sub.
 *
 * Ordering: events that arrive while the snapshot query is in flight are
 * buffered and replayed straight after the snapshot, so a subscriber never
 * sees a delta before the baseline it applies to.
 */
import type { Server } from "node:http";
import { WebSocketServer } from "ws";
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

const detailInclude = {
  challenge: { include: { testCases: true } },
  testResults: true,
  review: true,
} as const;

export function attachWebSocket(server: Server): void {
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (ws) => {
    const sub = createSubscriber();
    const subscribed = new Set<string>();
    let snapshotsSent = 0;
    const buffer: string[] = [];

    const send = (msg: ServerMessage): void => {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
    };
    const forwardRaw = (payload: string): void => {
      if (ws.readyState === ws.OPEN) ws.send(payload);
    };

    sub.on("message", (_channel: string, payload: string) => {
      if (snapshotsSent === 0) buffer.push(payload);
      else forwardRaw(payload);
    });

    ws.on("message", async (raw) => {
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
        if (subscribed.has(msg.submissionId)) return;
        await sub.subscribe(submissionChannel(msg.submissionId));

        const row = await prisma.submission.findUnique({
          where: { id: msg.submissionId },
          include: detailInclude,
        });
        if (!row) {
          await sub.unsubscribe(submissionChannel(msg.submissionId));
          send({ type: "error", submissionId: msg.submissionId, message: "unknown submission" });
          return;
        }

        subscribed.add(msg.submissionId);
        send({ type: "snapshot", submission: toSubmissionDetail(row) });
        snapshotsSent += 1;
        if (buffer.length > 0) {
          for (const p of buffer.splice(0)) forwardRaw(p);
        }
        return;
      }

      if (msg.type === "unsubscribe") {
        if (!subscribed.delete(msg.submissionId)) return;
        await sub.unsubscribe(submissionChannel(msg.submissionId));
      }
    });

    const cleanup = (): void => {
      subscribed.clear();
      void sub.quit().catch(() => undefined);
    };
    ws.on("close", cleanup);
    ws.on("error", cleanup);
  });

  const heartbeat = setInterval(() => {
    for (const client of wss.clients) {
      if (client.readyState === client.OPEN) client.ping();
    }
  }, 30_000);
  wss.on("close", () => clearInterval(heartbeat));

  log.info("websocket gateway attached", { path: "/ws" });
}
