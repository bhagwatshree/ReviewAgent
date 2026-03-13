/**
 * Diff Fetcher — retrieves diffs from local git, GitHub API, or GitLab API
 * Credentials via environment variables: GITHUB_TOKEN, GITLAB_TOKEN
 */

import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export type DiffType = "local" | "github" | "gitlab" | "remote" | "same";

export interface DiffArgs {
  type: DiffType;
  from?: string;
  to?: string;
  owner?: string;
  repo?: string;
  host?: string;
  projectPath?: string;
}

export interface DiffResult {
  diff: string;
  description: string;
}

/**
 * Parse a diff argument string into structured DiffArgs.
 *
 * Supported forms:
 *   ""                           → HEAD~1..HEAD (last 2 commits)
 *   "remote" / "upstream"        → local HEAD vs upstream tracking branch
 *   "v1.2.3"                     → v1.2.3..HEAD
 *   "v1.0 v1.2"                  → v1.0..v1.2
 *   "v1.0 v1.0"                  → same (triggers full project review)
 *   "https://github.com/…"       → GitHub compare API
 *   "https://gitlab.com/…"       → GitLab compare API
 */
export function parseDiffArgs(text: string): DiffArgs {
  const trimmed = text.trim();

  // GitHub compare URL: https://github.com/owner/repo/compare/base...head
  const ghMatch = trimmed.match(
    /https?:\/\/github\.com\/([^/]+)\/([^/]+)\/compare\/([^.]+)\.\.\.?(.+)/
  );
  if (ghMatch) {
    return {
      type: "github",
      owner: ghMatch[1],
      repo: ghMatch[2],
      from: ghMatch[3],
      to: ghMatch[4].split("?")[0],
    };
  }

  // GitLab compare URL: https://gitlab.com/owner/group/repo/-/compare/base...head
  const glMatch = trimmed.match(
    /https?:\/\/(gitlab\.[^/]+)\/(.+?)\/-?\/compare\/([^.]+)\.\.\.?(.+)/
  );
  if (glMatch) {
    return {
      type: "gitlab",
      host: glMatch[1],
      projectPath: glMatch[2],
      from: glMatch[3],
      to: glMatch[4].split("?")[0],
    };
  }

  // "remote" or "upstream" → compare local HEAD vs remote tracking branch
  if (/^(remote|upstream)$/i.test(trimmed)) {
    return { type: "remote" };
  }

  // No args → last 2 commits
  if (!trimmed) {
    return { type: "local", from: "HEAD~1", to: "HEAD" };
  }

  const parts = trimmed.split(/\s+/);
  if (parts.length >= 2) {
    const [from, to] = parts;
    if (from === to) return { type: "same", from, to };
    return { type: "local", from, to };
  }

  // Single ref → vs HEAD
  return { type: "local", from: parts[0], to: "HEAD" };
}

export async function fetchLocalGitDiff(
  workingDir: string,
  from: string,
  to: string
): Promise<string> {
  const { stdout } = await execFileAsync(
    "git",
    ["diff", `${from}..${to}`, "--stat", "--patch", "-U3"],
    { cwd: workingDir, maxBuffer: 10 * 1024 * 1024 }
  );
  return stdout;
}

export async function fetchLocalVsRemoteDiff(
  workingDir: string
): Promise<DiffResult> {
  // Fetch latest remote data
  await execFileAsync("git", ["fetch"], { cwd: workingDir }).catch(() => {});

  // Get upstream tracking branch
  let upstream = "";
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"],
      { cwd: workingDir }
    );
    upstream = stdout.trim();
  } catch {
    try {
      const { stdout } = await execFileAsync(
        "git",
        ["remote", "show", "-n", "origin"],
        { cwd: workingDir }
      );
      const m = stdout.match(/HEAD branch: (.+)/);
      upstream = m ? `origin/${m[1].trim()}` : "origin/main";
    } catch {
      upstream = "origin/main";
    }
  }

  const { stdout } = await execFileAsync(
    "git",
    ["diff", `${upstream}..HEAD`, "--stat", "--patch", "-U3"],
    { cwd: workingDir, maxBuffer: 10 * 1024 * 1024 }
  );
  return { diff: stdout, description: `local HEAD vs ${upstream}` };
}

export async function fetchGitHubDiff(
  owner: string,
  repo: string,
  from: string,
  to: string
): Promise<string> {
  const token = process.env.GITHUB_TOKEN;
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "CodeReviewAgent/1.0",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const url = `https://api.github.com/repos/${owner}/${repo}/compare/${from}...${to}`;
  const resp = await fetch(url, { headers });
  if (!resp.ok) {
    const hint =
      resp.status === 404
        ? " (repo not found or private — set GITHUB_TOKEN env var)"
        : "";
    throw new Error(`GitHub API ${resp.status}: ${resp.statusText}${hint}`);
  }
  const data = (await resp.json()) as any;
  const files: any[] = data.files ?? [];
  let diff = `# GitHub: ${owner}/${repo}  ${from}...${to}  (${files.length} files, ${data.ahead_by ?? "?"} commits ahead)\n\n`;
  for (const f of files) {
    diff += `--- a/${f.filename}\n+++ b/${f.filename}\n# ${f.status}  +${f.additions} -${f.deletions}\n`;
    if (f.patch) diff += f.patch + "\n\n";
  }
  return diff;
}

export async function fetchGitLabDiff(
  host: string,
  projectPath: string,
  from: string,
  to: string
): Promise<string> {
  const token = process.env.GITLAB_TOKEN;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["PRIVATE-TOKEN"] = token;

  const encodedPath = encodeURIComponent(projectPath);
  const url = `https://${host}/api/v4/projects/${encodedPath}/repository/compare?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
  const resp = await fetch(url, { headers });
  if (!resp.ok) {
    const hint =
      resp.status === 401 || resp.status === 404
        ? " — set GITLAB_TOKEN env var"
        : "";
    throw new Error(`GitLab API ${resp.status}: ${resp.statusText}${hint}`);
  }
  const data = (await resp.json()) as any;
  const diffs: any[] = data.diffs ?? [];
  const commits: any[] = data.commits ?? [];
  let diff = `# GitLab: ${projectPath}  ${from}...${to}  (${commits.length} commits, ${diffs.length} files)\n\n`;
  for (const d of diffs) {
    const status = d.new_file
      ? "added"
      : d.deleted_file
      ? "deleted"
      : d.renamed_file
      ? "renamed"
      : "modified";
    diff += `--- a/${d.old_path}\n+++ b/${d.new_path}\n# ${status}\n`;
    if (d.diff) diff += d.diff + "\n\n";
  }
  return diff;
}

/** Main entry point — fetch a diff given parsed args and a working directory */
export async function fetchDiff(
  args: DiffArgs,
  workingDir: string
): Promise<DiffResult> {
  switch (args.type) {
    case "remote":
      return fetchLocalVsRemoteDiff(workingDir);
    case "github": {
      const diff = await fetchGitHubDiff(
        args.owner!,
        args.repo!,
        args.from!,
        args.to!
      );
      return {
        diff,
        description: `${args.owner}/${args.repo} ${args.from}...${args.to}`,
      };
    }
    case "gitlab": {
      const diff = await fetchGitLabDiff(
        args.host!,
        args.projectPath!,
        args.from!,
        args.to!
      );
      return {
        diff,
        description: `${args.projectPath} ${args.from}...${args.to}`,
      };
    }
    default: {
      const diff = await fetchLocalGitDiff(
        workingDir,
        args.from!,
        args.to!
      );
      return { diff, description: `${args.from}..${args.to}` };
    }
  }
}
