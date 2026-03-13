/**
 * Project Reviewer — collects source files and generates review prompts.
 * No API calls — prompts are designed to be sent to your IDE's built-in LLM.
 */

import { readFile, readdir, stat } from "fs/promises";
import { join, extname, relative } from "path";
import type { ReviewDimension, DimensionReview } from "./types.js";

// ─── File collection helpers ──────────────────────────────────────────────────

const SKIP_DIRS = new Set([
  "node_modules", ".git", "__pycache__", ".next", "dist", "build",
  "coverage", ".venv", "venv", ".expo", "out", ".turbo", ".cache",
]);
const SOURCE_EXTS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".py", ".java", ".kt", ".go",
  ".rb", ".cs", ".php", ".swift", ".rs",
]);

export async function collectSourceFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  async function walk(dir: string) {
    const entries = await readdir(dir).catch(() => [] as string[]);
    for (const name of entries) {
      if (SKIP_DIRS.has(name) || name.startsWith(".")) continue;
      const full = join(dir, name);
      const s = await stat(full).catch(() => null);
      if (!s) continue;
      if (s.isDirectory()) await walk(full);
      else if (SOURCE_EXTS.has(extname(name).toLowerCase()) && s.size < 500 * 1024)
        files.push(full);
    }
  }
  await walk(root);
  return files;
}

export async function detectStack(root: string, files: string[]): Promise<string> {
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
  return layers.length > 0 ? layers.join(" + ") : "Mixed/Unknown";
}

// ─── Dimension specs ──────────────────────────────────────────────────────────

const DIMS: Record<
  string,
  { displayName: string; weight: number; systemPrompt: string }
> = {
  security: {
    displayName: "Security",
    weight: 0.2,
    systemPrompt:
      "You are a security reviewer. Check for auth bypasses, XSS, injection, secrets, CORS, IDOR. Cite CWE IDs.",
  },
  vulnerabilities: {
    displayName: "Vulnerabilities",
    weight: 0.15,
    systemPrompt:
      "You are a vulnerability researcher. Check for prototype pollution, ReDoS, SSRF, timing attacks, mass assignment.",
  },
  critical_blockers: {
    displayName: "Critical Blockers",
    weight: 0.2,
    systemPrompt:
      "Check for unimplemented critical paths, crash risks, data integrity issues, missing transactions.",
  },
  test_coverage: {
    displayName: "Test Coverage",
    weight: 0.15,
    systemPrompt:
      "Check for missing test files, untested critical paths, no edge cases, poor assertion quality.",
  },
  tech_debt: {
    displayName: "Tech Debt",
    weight: 0.1,
    systemPrompt:
      "Check for TODO/FIXMEs, dead code, deprecated APIs, copy-paste duplication, magic numbers.",
  },
  complexity: {
    displayName: "Complexity",
    weight: 0.1,
    systemPrompt:
      "Check for cyclomatic complexity >10, functions >50 lines, deep nesting, boolean trap parameters.",
  },
  naming_conventions: {
    displayName: "Naming",
    weight: 0.1,
    systemPrompt:
      "Check for wrong case conventions, vague names, inconsistency, misleading names.",
  },
};

const JSON_FORMAT = `Return JSON:
\`\`\`json
{"score":<0-10>,"summary":"<assessment>","findings":[{"severity":"<CRITICAL|HIGH|MEDIUM|LOW>","title":"<title>","description":"<desc>","file_path":"<path>","line":<n|null>,"suggestion":"<fix>","cwe_id":"<CWE or null>"}]}
\`\`\``;

// ─── Result types ─────────────────────────────────────────────────────────────

export interface ProjectReviewResult {
  dimensions: DimensionReview[];
  compositeScore: number;
  grade: string;
  stackInfo: string;
  fileCount: number;
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Review an entire project by collecting source files and generating prompts
 * for the IDE's built-in LLM. No API key required.
 */
export async function reviewProject(
  projectRoot: string,
  _apiKey: string,
  dimensions: ReviewDimension[],
  options: { onProgress?: (msg: string) => void; context?: string } = {}
): Promise<ProjectReviewResult> {
  options.onProgress?.("Scanning project files...");
  const allFiles = await collectSourceFiles(projectRoot);
  const stackInfo = await detectStack(projectRoot, allFiles);
  options.onProgress?.(
    `Found ${allFiles.length} source files (${stackInfo}). Building prompts...`
  );

  // Bundle source files (up to 80 KB total)
  let bundle = "";
  let bundleSize = 0;
  const MAX_BUNDLE = 80 * 1024;
  for (const file of allFiles) {
    if (bundleSize >= MAX_BUNDLE) break;
    const content = await readFile(file, "utf-8").catch(() => "");
    const relPath = relative(projectRoot, file);
    const entry = `\n\n// ─── ${relPath} ───\n${content}`;
    bundle += entry;
    bundleSize += entry.length;
  }
  if (bundleSize >= MAX_BUNDLE) {
    bundle += "\n\n// ... [bundle truncated — remaining files omitted]";
  }

  const header = `Project: ${projectRoot}\nStack: ${stackInfo}\nFiles: ${allFiles.length}\n`;

  console.log(`\n${"=".repeat(80)}`);
  console.log(`Project Review Prompts — ${projectRoot}`);
  console.log(`Stack: ${stackInfo} | Files: ${allFiles.length}`);
  console.log(`${"=".repeat(80)}\n`);
  console.log(`Copy each prompt into your IDE's chat (GitHub Copilot, Claude, etc.):\n`);

  const dimResults: DimensionReview[] = [];

  for (const dimKey of dimensions) {
    const meta = DIMS[dimKey];
    if (!meta) continue;

    const systemPrompt = `${meta.systemPrompt}\n\nYou are reviewing the ENTIRE project.\n${header}\n${JSON_FORMAT}`;
    const userPrompt = options.context
      ? `Review the project for ${meta.displayName} issues.\n\nContext:\n${options.context}\n\nSource files:\n\`\`\`\n${bundle}\n\`\`\``
      : `Review the project for ${meta.displayName} issues.\n\nSource files:\n\`\`\`\n${bundle}\n\`\`\``;

    console.log(`\n${"─".repeat(80)}`);
    console.log(`## ${meta.displayName} (weight: ${(meta.weight * 100).toFixed(0)}%)`);
    console.log(`${"─".repeat(80)}\n`);
    console.log(`**System:** ${systemPrompt}\n`);
    console.log(`**User prompt:**\n${userPrompt}`);

    dimResults.push({
      dimension: dimKey,
      displayName: meta.displayName,
      score: 0,
      weight: meta.weight,
      summary: "Pending IDE review",
      findings: [],
    });
  }

  console.log(`\n${"=".repeat(80)}`);
  console.log(`TIP: Register the MCP server in your IDE for seamless review:`);
  console.log(`  @codeReviewBuddy /project ${projectRoot}`);
  console.log(`${"=".repeat(80)}\n`);

  return {
    dimensions: dimResults,
    compositeScore: 0,
    grade: "N/A",
    stackInfo,
    fileCount: allFiles.length,
  };
}
