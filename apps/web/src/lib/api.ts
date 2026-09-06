import type {
  ChallengeDetail,
  ChallengeSummary,
  CreateSubmissionRequest,
  CreateSubmissionResponse,
  SubmissionDetail,
  SubmissionSummary,
} from "@codearena/shared";
import { API_URL } from "./config";

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

export const api = {
  listChallenges: () =>
    json<{ challenges: ChallengeSummary[] }>("/api/challenges").then((r) => r.challenges),

  getChallenge: (idOrSlug: string) => json<ChallengeDetail>(`/api/challenges/${idOrSlug}`),

  createSubmission: (body: CreateSubmissionRequest) =>
    json<CreateSubmissionResponse>("/api/submissions", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  listSubmissions: (challengeId?: string) =>
    json<{ submissions: SubmissionSummary[]; runningNow: number }>(
      `/api/submissions${challengeId ? `?challengeId=${challengeId}` : ""}`,
    ),

  getSubmission: (id: string) => json<SubmissionDetail>(`/api/submissions/${id}`),
};
