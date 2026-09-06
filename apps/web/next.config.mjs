import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The shared contract package ships raw .ts; let Next compile it.
  transpilePackages: ["@codearena/shared"],
  // Pin the workspace root (a stray lockfile in the home dir confuses inference).
  outputFileTracingRoot: repoRoot,
};

export default nextConfig;
