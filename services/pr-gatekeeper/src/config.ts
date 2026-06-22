import { resolveRepoRoot } from "./git.js";

/**
 * The repository the gatekeeper operates on. Defaults to the current working
 * directory's git root; override with GATEKEEPER_REPO_DIR.
 */
export async function getRepoRoot(): Promise<string> {
  const dir = process.env.GATEKEEPER_REPO_DIR?.trim() || process.cwd();
  return resolveRepoRoot(dir);
}
