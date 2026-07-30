/**
 * Module resolution hook so `node --test` can run the TypeScript sources
 * directly (Node 22 strips types natively) with the same `@/*` -> `src/*`
 * path alias that tsconfig.json declares.
 *
 * Deliberately dependency-free: the project ships no test runner, and adding
 * one (vitest/jest + transform stack) for a handful of pure-logic tests would
 * be a much bigger change than the bug fix it is meant to guard.
 */

import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SRC = path.join(ROOT, "src");

/** tsconfig "bundler" resolution: extensionless specifiers get suffixes tried. */
const CANDIDATE_SUFFIXES = ["", ".ts", ".tsx", ".mts", ".js", "/index.ts"];

function firstExisting(basePath) {
  for (const suffix of CANDIDATE_SUFFIXES) {
    const candidate = basePath + suffix;
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const resolved = firstExisting(path.join(SRC, specifier.slice(2)));
    if (resolved) {
      return { url: pathToFileURL(resolved).href, shortCircuit: true };
    }
  }
  return nextResolve(specifier, context);
}
