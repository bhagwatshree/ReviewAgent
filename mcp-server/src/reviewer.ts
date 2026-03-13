/**
 * Core review engine — streams Claude API calls for each dimension.
 * Used by both the MCP server and the VSCode extension.
 */

import Anthropic from "@anthropic-ai/sdk";
import { readFile, readdir, stat } from "fs/promises";
import { join, resolve, relative, extname, dirname } from "path";
import {
  DIMENSIONS,
  DimensionKey,
  ALL_DIMENSION_KEYS,
} from "./dimensions.js";

export interface Finding {
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";
  title: string;
  description: string;
  line?: number;
  suggestion: string;
  cwe_id?: string;
}

export interface DimensionResult {
  dimension: DimensionKey;
  displayName: string;
  score: number;
  weight: number;
  summary: string;
  findings: Finding[];
  thinking?: string;
}

export interface ReviewResult {
  compositeScore: number;
  grade: string;
  dimensions: DimensionResult[];
  criticalCount: number;
  highCount: number;
  markdownReport: string;
}

export interface ReviewOptions {
  dimensions?: DimensionKey[];
  language?: string;
  filePath?: string;
  context?: string; // extra context: Jira description, feature spec, etc.
  businessContext?: {
    jiraPath?: string;         // Path to Jira ticket (JSON, text, or markdown)
    brsPath?: string;          // Path to BRS document (PDF text, markdown, JSON)
    architecturePath?: string; // Path to architecture document
    figmaPath?: string;        // Path to Figma export (JSON or image)
    docsRoot?: string;         // Root path to search for documents (defaults to /docs/)
  };
  streaming?: boolean;
  onProgress?: (dimensionName: string, chunk: string) => void;
}

const GRADE_THRESHOLDS = [
  { min: 9.0, grade: "A+" },
  { min: 8.0, grade: "A" },
  { min: 7.0, grade: "B" },
  { min: 6.0, grade: "C" },
  { min: 5.0, grade: "D" },
  { min: 0.0, grade: "F" },
];

function scoreToGrade(score: number): string {
  return GRADE_THRESHOLDS.find((t) => score >= t.min)?.grade ?? "F";
}

function detectLanguage(code: string, filePath?: string): string {
  if (filePath) {
    const ext = filePath.split(".").pop()?.toLowerCase();
    const extMap: Record<string, string> = {
      ts: "TypeScript", tsx: "TypeScript (React)", js: "JavaScript",
      jsx: "JavaScript (React)", py: "Python", java: "Java",
      kt: "Kotlin", go: "Go", rb: "Ruby", cs: "C#", php: "PHP",
      swift: "Swift", rs: "Rust", cpp: "C++", c: "C",
      sql: "SQL", sh: "Shell", yaml: "YAML", yml: "YAML",
    };
    if (ext && extMap[ext]) return extMap[ext];
  }
  // heuristic detection
  if (code.includes("import React") || code.includes("jsx")) return "TypeScript (React)";
  if (code.includes("def ") && code.includes(":")) return "Python";
  if (code.includes("func ") && code.includes("package ")) return "Go";
  if (code.includes("public class ")) return "Java";
  return "TypeScript";
}

function parseReviewResponse(text: string): { score: number; summary: string; findings: Finding[] } {
  // Extract JSON block
  const jsonMatch = text.match(/```json\s*([\s\S]*?)```/);
  const rawJson = jsonMatch ? jsonMatch[1] : text;

  try {
    const parsed = JSON.parse(rawJson.trim());
    return {
      score: Math.min(10, Math.max(0, Number(parsed.score ?? 5))),
      summary: String(parsed.summary ?? ""),
      findings: (parsed.findings ?? []).map((f: any) => ({
        severity: f.severity ?? "INFO",
        title: f.title ?? "Finding",
        description: f.description ?? "",
        line: f.line ?? undefined,
        suggestion: f.suggestion ?? "",
        cwe_id: f.cwe_id ?? undefined,
      })),
    };
  } catch {
    // fallback: extract what we can
    const scoreMatch = text.match(/"score"\s*:\s*(\d+(?:\.\d+)?)/);
    return {
      score: scoreMatch ? parseFloat(scoreMatch[1]) : 5,
      summary: "Review completed (structured parsing failed — see raw output above).",
      findings: [],
    };
  }
}

/**
 * Load document content from /docs/ folder
 * Supports: JSON, PDF text exports, Figma exports, images
 */
async function loadBusinessDocument(docPath: string, projectRoot: string): Promise<string | null> {
  if (!docPath) return null;

  try {
    const fullPath = resolve(projectRoot, docPath);
    const fileContent = await readFile(fullPath, "utf-8");

    // Detect format by file extension
    const ext = extname(fullPath).toLowerCase();

    if (ext === ".json") {
      // Try to parse and pretty-print JSON
      try {
        const parsed = JSON.parse(fileContent);
        return JSON.stringify(parsed, null, 2);
      } catch {
        return fileContent; // Return as-is if not valid JSON
      }
    } else if (ext === ".pdf" || ext === ".txt" || ext === ".md") {
      return fileContent;
    } else if ([".png", ".jpg", ".jpeg", ".gif", ".webp"].includes(ext)) {
      return `[Image: ${relative(projectRoot, fullPath)}]\n(Note: Image content not directly readable; refer to design documents for visual specs)`;
    } else {
      return fileContent; // Treat as text
    }
  } catch (error) {
    return null; // Document not found or unreadable
  }
}

/**
 * Build business context string from requirement documents
 * Searches for documents in /docs/ folder if not explicitly provided
 */
async function buildBusinessContext(
  businessContext: ReviewOptions["businessContext"],
  projectRoot: string
): Promise<string> {
  if (!businessContext) return "";

  const docsRoot = businessContext.docsRoot || resolve(projectRoot, "docs");
  const contextParts: string[] = [];

  // Try to load each document type
  const docs = {
    Jira: businessContext.jiraPath,
    "BRS (Business Specification)": businessContext.brsPath,
    Architecture: businessContext.architecturePath,
    "Figma Design": businessContext.figmaPath,
  };

  for (const [label, docPath] of Object.entries(docs)) {
    if (!docPath) continue;

    // If just a filename, prepend docsRoot
    const searchPath = docPath.startsWith("docs/") || docPath.startsWith("docs\\")
      ? docPath
      : join("docs", docPath);

    const content = await loadBusinessDocument(searchPath, projectRoot);
    if (content) {
      // Truncate very large documents to avoid token bloat
      const maxLen = 8000;
      const truncated = content.length > maxLen ? content.substring(0, maxLen) + "\n... [truncated] ..." : content;
      contextParts.push(`## ${label}\n${truncated}`);
    }
  }

  return contextParts.length > 0
    ? `\n\n**Business Requirements & Design Context:**\n\n${contextParts.join("\n\n---\n\n")}`
    : "";
}

function buildUserMessage(
  code: string,
  language: string,
  filePath: string | undefined,
  context: string | undefined,
  dimensionKey: DimensionKey,
  businessContextStr?: string
): string {
  const dim = DIMENSIONS[dimensionKey];
  const fileRef = filePath ? `\nFile: \`${filePath}\`` : "";
  const contextBlock = context ? `\n\n**Additional Context:**\n${context}` : "";
  const businessBlock = businessContextStr ? businessContextStr : "";

  return `Review the following ${language} code for **${dim.displayName}** issues.${fileRef}${contextBlock}${businessBlock}

\`\`\`${language.toLowerCase().replace(/\s.*/, "")}
${code}
\`\`\`

Return your review as a JSON block in this exact format:
\`\`\`json
{
  "score": <0-10 integer>,
  "summary": "<2-3 sentence overall assessment>",
  "findings": [
    {
      "severity": "<CRITICAL|HIGH|MEDIUM|LOW|INFO>",
      "title": "<short title>",
      "description": "<what the issue is and why it matters>",
      "line": <line number if applicable, else null>,
      "suggestion": "<concrete fix>",
      "cwe_id": "<CWE-NNN if applicable, else null>"
    }
  ]
}
\`\`\`

List only real findings — do not invent issues. If the code is clean for this dimension, return an empty findings array with a high score.`;
}

function buildMarkdownReport(
  code: string,
  filePath: string | undefined,
  language: string,
  results: DimensionResult[],
  composite: number,
  grade: string
): string {
  const bar = (score: number) => {
    const filled = Math.round(score);
    return `[${"#".repeat(filled)}${"·".repeat(10 - filled)}] ${score.toFixed(1)}/10`;
  };

  const severityIcon = (s: string) =>
    ({ CRITICAL: "🔴", HIGH: "🟠", MEDIUM: "🟡", LOW: "🔵", INFO: "⚪" }[s] ?? "⚪");

  const target = filePath ? `\`${filePath}\`` : "selected code";

  let md = `# Code Review Report

**Target:** ${target}
**Language:** ${language}
**Overall Score:** ${composite.toFixed(1)}/10  (Grade **${grade}**)

\`\`\`
Overall  ${bar(composite)}
\`\`\`

## Dimension Scores

| Dimension | Score | Weight | Status |
|-----------|-------|--------|--------|
`;

  for (const r of results) {
    const status = r.score >= 7 ? "✅" : r.score >= 4 ? "⚠️" : "❌";
    md += `| ${r.displayName} | ${r.score.toFixed(1)}/10 | ${(r.weight * 100).toFixed(0)}% | ${status} |\n`;
  }

  const criticalFindings = results.flatMap((r) =>
    r.findings.filter((f) => f.severity === "CRITICAL").map((f) => ({ ...f, dimension: r.displayName }))
  );

  if (criticalFindings.length > 0) {
    md += `\n## 🔴 Critical Findings\n\n`;
    for (const f of criticalFindings) {
      md += `### ${f.title} *(${f.dimension})*\n`;
      if (f.cwe_id) md += `**${f.cwe_id}**  `;
      if (f.line) md += `Line ${f.line}  `;
      md += `\n${f.description}\n\n**Fix:** ${f.suggestion}\n\n---\n\n`;
    }
  }

  md += `\n## Detailed Findings\n\n`;
  for (const r of results) {
    md += `### ${r.displayName} — ${r.score.toFixed(1)}/10\n\n${r.summary}\n\n`;
    if (r.findings.length === 0) {
      md += `_No issues found._\n\n`;
    } else {
      for (const f of r.findings) {
        md += `**${severityIcon(f.severity)} ${f.severity} — ${f.title}**`;
        if (f.line) md += ` (line ${f.line})`;
        if (f.cwe_id) md += ` \`${f.cwe_id}\``;
        md += `\n\n${f.description}\n\n> **Suggestion:** ${f.suggestion}\n\n`;
      }
    }
  }

  return md;
}

export async function reviewCode(
  code: string,
  options: ReviewOptions = {}
): Promise<ReviewResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY environment variable not set");

  const client = new Anthropic({ apiKey });
  const dimensionKeys = options.dimensions ?? ALL_DIMENSION_KEYS;
  const language = options.language ?? detectLanguage(code, options.filePath);
  const results: DimensionResult[] = [];

  // Build business context if documents are provided
  const projectRoot = resolve(options.filePath ? dirname(options.filePath) : process.cwd());
  const businessContextStr = await buildBusinessContext(options.businessContext, projectRoot);

  for (const dimKey of dimensionKeys) {
    const dim = DIMENSIONS[dimKey];
    options.onProgress?.(dim.displayName, `Analyzing ${dim.displayName}...`);

    let fullText = "";
    let thinkingText = "";

    // Include business context only for business_logic dimension
    const contextForMessage = dimKey === "business_logic" ? businessContextStr : "";

    const stream = client.messages.stream({
      model: "claude-opus-4-6",
      max_tokens: 4096,
      thinking: { type: "adaptive" } as any,
      system: dim.systemPrompt,
      messages: [
        {
          role: "user",
          content: buildUserMessage(
            code,
            language,
            options.filePath,
            options.context,
            dimKey,
            contextForMessage
          ),
        },
      ],
    });

    for await (const event of stream) {
      if (event.type === "content_block_delta") {
        if (event.delta.type === "thinking_delta") {
          thinkingText += event.delta.thinking;
        } else if (event.delta.type === "text_delta") {
          fullText += event.delta.text;
          options.onProgress?.(dim.displayName, event.delta.text);
        }
      }
    }

    const parsed = parseReviewResponse(fullText);
    results.push({
      dimension: dimKey,
      displayName: dim.displayName,
      score: parsed.score,
      weight: dim.weight,
      summary: parsed.summary,
      findings: parsed.findings,
      thinking: thinkingText || undefined,
    });
  }

  // Weighted composite score (normalize weights for subset of dimensions)
  const totalWeight = results.reduce((s, r) => s + r.weight, 0);
  const compositeScore =
    results.reduce((s, r) => s + r.score * r.weight, 0) /
    (totalWeight || 1);

  const criticalCount = results.flatMap((r) =>
    r.findings.filter((f) => f.severity === "CRITICAL")
  ).length;

  const highCount = results.flatMap((r) =>
    r.findings.filter((f) => f.severity === "HIGH")
  ).length;

  const grade = scoreToGrade(compositeScore);
  const markdownReport = buildMarkdownReport(
    code,
    options.filePath,
    language,
    results,
    compositeScore,
    grade
  );

  return {
    compositeScore: Math.round(compositeScore * 10) / 10,
    grade,
    dimensions: results,
    criticalCount,
    highCount,
    markdownReport,
  };
}

export async function reviewFile(
  filePath: string,
  options: Omit<ReviewOptions, "filePath"> = {}
): Promise<ReviewResult> {
  const content = await readFile(filePath, "utf-8");
  return reviewCode(content, { ...options, filePath });
}

// ─── Project-level review ─────────────────────────────────────────────────────

export interface ProjectReviewOptions {
  dimensions?: DimensionKey[];
  context?: string;
  maxFilesPerDimension?: number;
  onProgress?: (msg: string) => void;
}

export interface ProjectReviewResult extends ReviewResult {
  projectRoot: string;
  filesScanned: number;
  stackInfo: string;
}

const SKIP_DIRS = new Set([
  "node_modules", ".git", "__pycache__", ".next", "dist", "build",
  "coverage", ".venv", "venv", ".expo", "out", ".turbo", ".cache",
]);

const SOURCE_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".py", ".java", ".kt", ".go",
  ".rb", ".cs", ".php", ".swift", ".rs", ".cpp", ".c",
]);

/** Recursively collect source files, skipping vendor/generated dirs. */
async function collectSourceFiles(root: string): Promise<string[]> {
  const files: string[] = [];

  async function walk(dir: string) {
    let entries: string[];
    try {
      entries = await readdir(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      if (SKIP_DIRS.has(name) || name.startsWith(".")) continue;
      const full = join(dir, name);
      const s = await stat(full).catch(() => null);
      if (!s) continue;
      if (s.isDirectory()) {
        await walk(full);
      } else if (SOURCE_EXTENSIONS.has(extname(name).toLowerCase())) {
        if (s.size < 500 * 1024) files.push(full); // skip files > 500KB
      }
    }
  }

  await walk(root);
  return files;
}

/** Detect tech stack from the file list. */
async function detectStack(root: string, files: string[]): Promise<string> {
  const layers: string[] = [];

  const hasTsx = files.some((f) => f.endsWith(".tsx"));
  const hasJsx = files.some((f) => f.endsWith(".jsx"));
  const hasPy = files.some((f) => f.endsWith(".py"));
  const hasGo = files.some((f) => f.endsWith(".go"));
  const hasJava = files.some((f) => f.endsWith(".java"));

  // Check package.json for framework hints
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
  if (layers.length === 0) layers.push("Unknown stack");

  return layers.join(" + ");
}

/**
 * File tools Claude can call to explore the project.
 * Each tool runs locally and returns its result as a string.
 */
const FILE_TOOLS: Anthropic.Tool[] = [
  {
    name: "read_file",
    description: "Read the content of a source file",
    input_schema: {
      type: "object" as const,
      properties: {
        file_path: { type: "string", description: "Absolute path to the file" },
        start_line: { type: "number", description: "First line to read (1-indexed, optional)" },
        end_line: { type: "number", description: "Last line to read (optional)" },
      },
      required: ["file_path"],
    },
  },
  {
    name: "list_directory",
    description: "List files and subdirectories in a directory",
    input_schema: {
      type: "object" as const,
      properties: {
        directory_path: { type: "string", description: "Absolute path to the directory" },
      },
      required: ["directory_path"],
    },
  },
  {
    name: "glob_files",
    description: "Find files matching a glob pattern (e.g. **/*.test.ts)",
    input_schema: {
      type: "object" as const,
      properties: {
        base_path: { type: "string", description: "Base directory to search from" },
        pattern: { type: "string", description: "Glob pattern (e.g. **/*.ts)" },
      },
      required: ["base_path", "pattern"],
    },
  },
  {
    name: "search_in_files",
    description: "Search for a regex pattern across source files",
    input_schema: {
      type: "object" as const,
      properties: {
        base_path: { type: "string", description: "Directory to search in" },
        pattern: { type: "string", description: "Regex pattern to search for" },
        file_extension: { type: "string", description: "File extension filter e.g. .ts" },
      },
      required: ["base_path", "pattern"],
    },
  },
];

async function executeFileTool(
  toolName: string,
  input: Record<string, unknown>,
  allowedRoot: string
): Promise<string> {

  // Security: ensure all paths stay inside the project root
  function safePath(p: string): string {
    const abs = resolve(p);
    const rel = relative(allowedRoot, abs);
    if (rel.startsWith("..")) throw new Error(`Path outside project root: ${p}`);
    return abs;
  }

  try {
    switch (toolName) {
      case "read_file": {
        const filePath = safePath(input.file_path as string);
        const content = await readFile(filePath, "utf-8");
        const lines = content.split("\n");
        const start = input.start_line ? Number(input.start_line) - 1 : 0;
        const end = input.end_line ? Number(input.end_line) : lines.length;
        const selected = lines.slice(start, end);
        return JSON.stringify({
          file_path: filePath,
          content: selected.join("\n"),
          total_lines: lines.length,
          start_line: start + 1,
          end_line: Math.min(end, lines.length),
        });
      }

      case "list_directory": {
        const dirPath = safePath(input.directory_path as string);
        const entries = await readdir(dirPath);
        const result = await Promise.all(
          entries
            .filter((e) => !SKIP_DIRS.has(e) && !e.startsWith("."))
            .map(async (name) => {
              const full = join(dirPath, name);
              const s = await stat(full).catch(() => null);
              return {
                name,
                type: s?.isDirectory() ? "directory" : "file",
                size_bytes: s?.isFile() ? s.size : null,
              };
            })
        );
        return JSON.stringify({ directory: dirPath, entries: result });
      }

      case "glob_files": {
        const basePath = safePath(input.base_path as string);
        const pattern = input.pattern as string;
        // Simple glob: use recursive walk + fnmatch-style
        const allFiles = await collectSourceFiles(basePath);
        const patternBase = pattern.replace(/\*\*\//g, "").replace(/\*/g, ".*");
        const re = new RegExp(patternBase.replace(/\./g, "\\.") + "$");
        const matches = allFiles.filter((f) => re.test(f)).slice(0, 80);
        return JSON.stringify({ base_path: basePath, pattern, matches, count: matches.length });
      }

      case "search_in_files": {
        const basePath = safePath(input.base_path as string);
        const pattern = input.pattern as string;
        const ext = input.file_extension as string | undefined;
        const allFiles = await collectSourceFiles(basePath);
        const candidates = ext ? allFiles.filter((f) => f.endsWith(ext)) : allFiles;
        const re = new RegExp(pattern, "i");
        const results: Array<{ file: string; line_number: number; match: string }> = [];

        for (const file of candidates) {
          if (results.length >= 40) break;
          const lines = (await readFile(file, "utf-8").catch(() => "")).split("\n");
          for (let i = 0; i < lines.length; i++) {
            if (re.test(lines[i])) {
              results.push({ file, line_number: i + 1, match: lines[i].trim() });
              if (results.length >= 40) break;
            }
          }
        }
        return JSON.stringify({ pattern, matches: results, count: results.length });
      }

      default:
        return JSON.stringify({ error: `Unknown tool: ${toolName}` });
    }
  } catch (err) {
    return JSON.stringify({ error: String(err) });
  }
}

/**
 * Review an entire project directory.
 *
 * Each dimension runs as an agentic loop: Claude gets file-browsing tools
 * (read_file, list_directory, glob_files, search_in_files) and explores the
 * project autonomously — exactly like the Python CLI agent.
 */
export async function reviewProject(
  projectRoot: string,
  options: ProjectReviewOptions = {}
): Promise<ProjectReviewResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY environment variable not set");

  const root = resolve(projectRoot);

  options.onProgress?.("Scanning project files...");
  const allFiles = await collectSourceFiles(root);
  const stackInfo = await detectStack(root, allFiles);
  options.onProgress?.(`Found ${allFiles.length} source files. Stack: ${stackInfo}`);

  const client = new Anthropic({ apiKey });
  const dimensionKeys = options.dimensions ?? ALL_DIMENSION_KEYS;
  const results: DimensionResult[] = [];

  for (const dimKey of dimensionKeys) {
    const dim = DIMENSIONS[dimKey];
    options.onProgress?.(`Reviewing ${dim.displayName}...`);

    const systemPrompt =
      dim.systemPrompt +
      `\n\nYou are reviewing an entire project. Use the provided file tools to explore the codebase:
- Start with list_directory on the project root to understand the structure
- Use glob_files to find relevant files (e.g. **/*.ts, **/*.test.ts)
- Use read_file to read specific files
- Use search_in_files to find patterns across the whole codebase

Project root: ${root}
Stack: ${stackInfo}
Total source files: ${allFiles.length}

After exploring, return your review as a JSON block:
\`\`\`json
{
  "score": <0-10>,
  "summary": "<3-4 sentence project-level assessment>",
  "findings": [
    {
      "severity": "<CRITICAL|HIGH|MEDIUM|LOW|INFO>",
      "title": "<short title>",
      "description": "<what and why, with file paths>",
      "file_path": "<relative path if applicable>",
      "line": <number or null>,
      "suggestion": "<concrete fix>",
      "cwe_id": "<CWE-NNN or null>"
    }
  ]
}
\`\`\``;

    const userMessage = options.context
      ? `Review the project for **${dim.displayName}** issues.\n\nContext:\n${options.context}`
      : `Review the project for **${dim.displayName}** issues. Explore the codebase using the available tools.`;

    // Agentic loop: Claude calls file tools until it has enough info to write the review
    const messages: Anthropic.MessageParam[] = [
      { role: "user", content: userMessage },
    ];

    let fullText = "";
    let thinkingText = "";
    let toolCallCount = 0;
    const MAX_TOOL_CALLS = 25;

    while (toolCallCount < MAX_TOOL_CALLS) {
      const response = await client.messages.create({
        model: "claude-opus-4-6",
        max_tokens: 8096,
        thinking: { type: "adaptive" } as any,
        system: systemPrompt,
        tools: FILE_TOOLS,
        messages,
      });

      // Collect thinking and text from this response
      for (const block of response.content) {
        if (block.type === "thinking") thinkingText += block.thinking;
        if (block.type === "text") fullText = block.text; // overwrite — last text wins
      }

      // Append assistant turn
      messages.push({ role: "assistant", content: response.content });

      if (response.stop_reason === "end_turn") break;
      if (response.stop_reason !== "tool_use") break;

      // Execute all tool calls and collect results
      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const block of response.content) {
        if (block.type !== "tool_use") continue;
        toolCallCount++;
        options.onProgress?.(`  [${dim.displayName}] ${block.name}(${JSON.stringify(block.input).slice(0, 60)}...)`);

        const result = await executeFileTool(
          block.name,
          block.input as Record<string, unknown>,
          root
        );
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: result,
        });
      }

      messages.push({ role: "user", content: toolResults });
    }

    const parsed = parseReviewResponse(fullText);
    results.push({
      dimension: dimKey,
      displayName: dim.displayName,
      score: parsed.score,
      weight: dim.weight,
      summary: parsed.summary,
      findings: parsed.findings,
      thinking: thinkingText || undefined,
    });
  }

  const totalWeight = results.reduce((s, r) => s + r.weight, 0);
  const compositeScore =
    results.reduce((s, r) => s + r.score * r.weight, 0) / (totalWeight || 1);

  const criticalCount = results
    .flatMap((r) => r.findings)
    .filter((f) => f.severity === "CRITICAL").length;
  const highCount = results
    .flatMap((r) => r.findings)
    .filter((f) => f.severity === "HIGH").length;

  const grade = scoreToGrade(compositeScore);

  // Build project-level report
  const markdownReport = buildProjectMarkdownReport(
    root,
    stackInfo,
    allFiles.length,
    results,
    compositeScore,
    grade
  );

  return {
    compositeScore: Math.round(compositeScore * 10) / 10,
    grade,
    dimensions: results,
    criticalCount,
    highCount,
    markdownReport,
    projectRoot: root,
    filesScanned: allFiles.length,
    stackInfo,
  };
}

function buildProjectMarkdownReport(
  root: string,
  stackInfo: string,
  filesScanned: number,
  results: DimensionResult[],
  composite: number,
  grade: string
): string {
  const bar = (s: number) =>
    `[${"#".repeat(Math.round(s))}${"·".repeat(10 - Math.round(s))}] ${s.toFixed(1)}/10`;
  const icon = (s: string) =>
    ({ CRITICAL: "🔴", HIGH: "🟠", MEDIUM: "🟡", LOW: "🔵", INFO: "⚪" }[s] ?? "⚪");

  let md = `# Project Code Review Report\n\n`;
  md += `**Project:** \`${root}\`  \n`;
  md += `**Stack:** ${stackInfo}  \n`;
  md += `**Files scanned:** ${filesScanned}  \n`;
  md += `**Overall Score:** ${composite.toFixed(1)}/10 — Grade **${grade}**\n\n`;
  md += "```\nOverall  " + bar(composite) + "\n```\n\n";

  md += `## Dimension Scores\n\n`;
  md += `| Dimension | Score | Weight | Status |\n|-----------|-------|--------|--------|\n`;
  for (const r of results) {
    const ok = r.score >= 7 ? "✅" : r.score >= 4 ? "⚠️" : "❌";
    md += `| ${ok} ${r.displayName} | ${r.score.toFixed(1)}/10 | ${(r.weight * 100).toFixed(0)}% | ${ok} |\n`;
  }

  const crits = results.flatMap((r) =>
    r.findings
      .filter((f) => f.severity === "CRITICAL")
      .map((f) => ({ ...f, dim: r.displayName }))
  );
  if (crits.length > 0) {
    md += `\n## 🔴 Critical Findings (${crits.length})\n\n`;
    for (const f of crits) {
      md += `### ${f.title} *(${f.dim})*\n`;
      const meta = [(f as any).file_path, f.cwe_id, f.line ? `line ${f.line}` : ""]
        .filter(Boolean).join(" · ");
      if (meta) md += `${meta}\n\n`;
      md += `${f.description}\n\n> **Fix:** ${f.suggestion}\n\n---\n\n`;
    }
  }

  const highs = results.flatMap((r) =>
    r.findings
      .filter((f) => f.severity === "HIGH")
      .map((f) => ({ ...f, dim: r.displayName }))
  );
  if (highs.length > 0) {
    md += `## 🟠 High Findings (${highs.length})\n\n`;
    for (const f of highs) {
      md += `**${f.title}** *(${f.dim})*`;
      if ((f as any).file_path) md += ` — \`${(f as any).file_path}\``;
      if (f.line) md += ` line ${f.line}`;
      md += `\n\n${f.description}\n\n> **Fix:** ${f.suggestion}\n\n`;
    }
  }

  md += `\n## Detailed Findings by Dimension\n\n`;
  for (const r of results) {
    md += `### ${r.displayName} — ${r.score.toFixed(1)}/10\n\n${r.summary}\n\n`;
    const nonInfo = r.findings.filter((f) => f.severity !== "INFO");
    if (nonInfo.length === 0) {
      md += `_No significant issues found._\n\n`;
    } else {
      for (const f of nonInfo) {
        md += `**${icon(f.severity)} ${f.severity} — ${f.title}**`;
        if ((f as any).file_path) md += ` \`${(f as any).file_path}\``;
        if (f.line) md += ` line ${f.line}`;
        if (f.cwe_id) md += ` \`${f.cwe_id}\``;
        md += `\n\n${f.description}\n\n> **Suggestion:** ${f.suggestion}\n\n`;
      }
    }
  }

  return md;
}
