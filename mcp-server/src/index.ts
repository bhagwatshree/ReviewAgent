#!/usr/bin/env node
/**
 * Code Review MCP Server
 *
 * Exposes file collection and diff tools to the IDE's built-in LLM.
 * The LLM (GitHub Copilot, Claude, etc.) calls these tools to gather code,
 * then reviews it using its own intelligence — no API key needed.
 *
 * Usage: node dist/index.js
 *
 * Register in VSCode settings (GitHub Copilot MCP):
 *   "mcp": { "servers": { "code-review": { "command": "node", "args": ["/path/to/dist/index.js"] } } }
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { readFile, readdir, stat } from "fs/promises";
import { join, resolve, relative, extname } from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { z } from "zod";
import { DIMENSIONS, ALL_DIMENSION_KEYS } from "./dimensions.js";

const execFileAsync = promisify(execFile);

const server = new McpServer(
  { name: "code-review", version: "2.0.0" }
);

// ─── Shared helpers ───────────────────────────────────────────────────────────

const SKIP_DIRS = new Set([
  "node_modules", ".git", "__pycache__", ".next", "dist", "build",
  "coverage", ".venv", "venv", ".expo", "out", ".turbo", ".cache",
]);

const SOURCE_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".py", ".java", ".kt", ".go",
  ".rb", ".cs", ".php", ".swift", ".rs", ".cpp", ".c",
]);

async function collectSourceFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  async function walk(dir: string) {
    let entries: string[];
    try { entries = await readdir(dir); } catch { return; }
    for (const name of entries) {
      if (SKIP_DIRS.has(name) || name.startsWith(".")) continue;
      const full = join(dir, name);
      const s = await stat(full).catch(() => null);
      if (!s) continue;
      if (s.isDirectory()) await walk(full);
      else if (SOURCE_EXTENSIONS.has(extname(name).toLowerCase()) && s.size < 500 * 1024)
        files.push(full);
    }
  }
  await walk(root);
  return files;
}

async function detectStack(root: string, files: string[]): Promise<string> {
  const layers: string[] = [];
  const hasTsx = files.some((f) => f.endsWith(".tsx"));
  const hasJsx = files.some((f) => f.endsWith(".jsx"));
  const hasPy = files.some((f) => f.endsWith(".py"));
  const hasGo = files.some((f) => f.endsWith(".go"));
  const hasJava = files.some((f) => f.endsWith(".java"));
  try {
    const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf-8"));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    if (deps["react-native"] || deps["expo"]) layers.push("Mobile (React Native)");
    else if (deps["react"] || hasTsx || hasJsx) layers.push("Frontend (React)");
    if (deps["express"] || deps["fastify"] || deps["koa"]) layers.push("Backend (Node.js)");
    if (deps["next"]) layers.push("Full-stack (Next.js)");
  } catch {}
  if (hasPy) layers.push("Backend (Python)");
  if (hasGo) layers.push("Backend (Go)");
  if (hasJava) layers.push("Backend (Java)");
  return layers.length > 0 ? layers.join(" + ") : "Unknown stack";
}

// ─── Tool registrations ───────────────────────────────────────────────────────

server.tool(
  "get_file_content",
  "Read a source file for code review. Returns the file content with line numbers.",
  {
    file_path: z.string().describe("Absolute path to the file"),
    start_line: z.number().optional().describe("First line to read (1-indexed, optional)"),
    end_line: z.number().optional().describe("Last line to read (optional)"),
  },
  async ({ file_path, start_line, end_line }) => {
    const filePath = resolve(file_path);
    const content = await readFile(filePath, "utf-8");
    const lines = content.split("\n");
    const start = start_line ? Number(start_line) - 1 : 0;
    const end = end_line ? Number(end_line) : lines.length;
    const selected = lines.slice(start, end);
    const numbered = selected.map((l, i) => `${String(start + i + 1).padStart(4, " ")} | ${l}`).join("\n");
    return {
      content: [{
        type: "text",
        text: `File: ${filePath}\nLines: ${start + 1}-${Math.min(end, lines.length)} of ${lines.length}\n\n${numbered}`,
      }],
    };
  }
);

server.tool(
  "get_project_structure",
  "Scan a project directory and return its structure: file list, detected tech stack, and key file contents (package.json, tsconfig, etc.). Use this before reviewing a project.",
  {
    project_root: z.string().describe("Absolute path to the project root directory"),
    include_key_files: z.boolean().optional().describe("Whether to include content of key config files (package.json, requirements.txt, etc.). Default: true."),
  },
  async ({ project_root, include_key_files }) => {
    const root = resolve(project_root);
    const includeKeyFiles = include_key_files !== false;
    const files = await collectSourceFiles(root);
    const stackInfo = await detectStack(root, files);

    const fileList = files.map((f) => `  ${relative(root, f)}`).join("\n");

    let keyFiles = "";
    if (includeKeyFiles) {
      const candidates = ["package.json", "requirements.txt", "pyproject.toml", "go.mod", "tsconfig.json", "Dockerfile"];
      for (const candidate of candidates) {
        try {
          const content = await readFile(join(root, candidate), "utf-8");
          keyFiles += `\n\n--- ${candidate} ---\n${content.slice(0, 3000)}`;
        } catch {}
      }
    }

    return {
      content: [{
        type: "text",
        text: `Project: ${root}\nStack: ${stackInfo}\nSource files (${files.length}):\n${fileList}${keyFiles}`,
      }],
    };
  }
);

server.tool(
  "list_directory",
  "List files and subdirectories in a directory. Use to explore project structure.",
  {
    directory_path: z.string().describe("Absolute path to the directory"),
  },
  async ({ directory_path }) => {
    const dirPath = resolve(directory_path);
    const entries = await readdir(dirPath);
    const result = await Promise.all(
      entries
        .filter((e) => !SKIP_DIRS.has(e) && !e.startsWith("."))
        .map(async (name) => {
          const full = join(dirPath, name);
          const s = await stat(full).catch(() => null);
          const type = s?.isDirectory() ? "dir " : "file";
          const size = s?.isFile() ? ` (${Math.round((s.size || 0) / 1024)}KB)` : "";
          return `  [${type}] ${name}${size}`;
        })
    );
    return {
      content: [{ type: "text", text: `Directory: ${dirPath}\n\n${result.join("\n")}` }],
    };
  }
);

server.tool(
  "search_in_files",
  "Search for a regex pattern across source files. Useful for finding security issues, patterns, or dependencies.",
  {
    base_path: z.string().describe("Directory to search in"),
    pattern: z.string().describe("Regex pattern to search for"),
    file_extension: z.string().optional().describe("Filter by extension, e.g. .ts"),
  },
  async ({ base_path, pattern, file_extension }) => {
    const basePath = resolve(base_path);
    const files = await collectSourceFiles(basePath);
    const candidates = file_extension ? files.filter((f) => f.endsWith(file_extension)) : files;
    const re = new RegExp(pattern, "i");
    const hits: string[] = [];

    for (const file of candidates) {
      if (hits.length >= 50) break;
      const lines = (await readFile(file, "utf-8").catch(() => "")).split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (re.test(lines[i])) {
          hits.push(`${relative(basePath, file)}:${i + 1}: ${lines[i].trim()}`);
          if (hits.length >= 50) break;
        }
      }
    }

    return {
      content: [{
        type: "text",
        text: hits.length > 0
          ? `Found ${hits.length} match(es) for /${pattern}/:\n\n${hits.join("\n")}`
          : `No matches found for /${pattern}/ in ${basePath}`,
      }],
    };
  }
);

server.tool(
  "get_git_diff",
  "Get the git diff between two refs. Use for reviewing code changes between commits or branches.",
  {
    project_root: z.string().describe("Absolute path to the git repository root"),
    from: z.string().optional().describe("From ref (commit, tag, branch). Defaults to HEAD~1."),
    to: z.string().optional().describe("To ref. Defaults to HEAD."),
  },
  async ({ project_root, from, to }) => {
    const root = resolve(project_root);
    const fromRef = from || "HEAD~1";
    const toRef = to || "HEAD";
    try {
      const { stdout } = await execFileAsync(
        "git",
        ["diff", `${fromRef}..${toRef}`, "--stat", "--patch", "-U3"],
        { cwd: root, maxBuffer: 10 * 1024 * 1024 }
      );
      return {
        content: [{
          type: "text",
          text: stdout.trim()
            ? `Git diff ${fromRef}..${toRef} in ${root}:\n\n${stdout}`
            : `No changes between ${fromRef} and ${toRef}`,
        }],
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: `Error getting git diff: ${err instanceof Error ? err.message : String(err)}` }],
        isError: true,
      };
    }
  }
);

server.tool(
  "get_review_criteria",
  "Get the review criteria (prompts and weights) for each dimension. Use this to understand what to look for when reviewing code.",
  {
    dimensions: z.array(z.enum(ALL_DIMENSION_KEYS as [string, ...string[]])).optional().describe("Which dimensions to return criteria for. Defaults to all."),
  },
  async ({ dimensions }) => {
    const keys = dimensions ?? ALL_DIMENSION_KEYS;
    const lines = keys.map((k) => {
      const d = DIMENSIONS[k as keyof typeof DIMENSIONS];
      if (!d) return null;
      return `## ${d.displayName} (weight: ${(d.weight * 100).toFixed(0)}%)\n${d.systemPrompt}`;
    }).filter(Boolean);
    return {
      content: [{
        type: "text",
        text: `# Code Review Criteria\n\nUse these criteria when reviewing code. For each dimension, score 0-10 and list findings.\n\n${lines.join("\n\n---\n\n")}`,
      }],
    };
  }
);

server.tool(
  "list_dimensions",
  "List all available review dimensions with their names and weights.",
  {},
  async () => {
    const lines = Object.values(DIMENSIONS).map(
      (d) => `- **${d.displayName}** (\`${d.name}\`, weight ${(d.weight * 100).toFixed(0)}%): ${d.systemPrompt.split("\n")[0]}`
    );
    return {
      content: [{
        type: "text",
        text: `## Available Review Dimensions\n\n${lines.join("\n")}\n\nUse \`get_review_criteria\` to get full prompts for any dimension.`,
      }],
    };
  }
);

// ─── Start server ─────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write("Code Review MCP Server v2.0 running on stdio (no API key required)\n");
  process.stderr.write("Tools: get_file_content, get_project_structure, list_directory, search_in_files, get_git_diff, get_review_criteria, list_dimensions\n");
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${err}\n`);
  process.exit(1);
});
