import type { FastifyInstance } from "fastify";
import { getChallengeDetail, getChallengeIndex, resolveChallengeId } from "../cache.js";

export async function challengeRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/challenges", async () => {
    return { challenges: await getChallengeIndex() };
  });

  app.get<{ Params: { idOrSlug: string } }>(
    "/api/challenges/:idOrSlug",
    async (req, reply) => {
      const id = await resolveChallengeId(req.params.idOrSlug);
      if (!id) return reply.code(404).send({ error: "challenge not found" });
      const detail = await getChallengeDetail(id);
      if (!detail) return reply.code(404).send({ error: "challenge not found" });
      return detail;
    },
  );
}
