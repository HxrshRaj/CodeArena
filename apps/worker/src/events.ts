import { submissionChannel, type SubmissionEvent } from "@codearena/shared";
import { pub } from "./redis.js";

/**
 * Publish one execution/review event onto the submission's Redis channel.
 * The API's WebSocket gateway is subscribed and forwards it to browsers.
 */
export async function publishEvent(submissionId: string, event: SubmissionEvent): Promise<void> {
  await pub.publish(submissionChannel(submissionId), JSON.stringify(event));
}
