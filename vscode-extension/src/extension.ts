/**
 * VSCode Extension — Code Review Agent
 *
 * Provides:
 *  1. @code-review chat participant (Copilot/Claude chat panel)
 *  2. Editor context menu commands (right-click → Review Selection / Review File)
 *  3. Command palette commands
 *
 * Requires VSCode 1.95+ (Chat Participant API)
 */

import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs/promises";
import { reviewCode, DimensionKey, ReviewResult } from "./reviewer.js";

const PARTICIPANT_ID = "code-review.reviewer";

// ─── API key helper ───────────────────────────────────────────────────────────

function getApiKey(): string {
  const cfg = vscode.workspace
    .getConfiguration("codeReview")
    .get<string>("anthropicApiKey");
  const env = process.env.ANTHROPIC_API_KEY;
  const key = cfg || env || "";
  if (!key) {
    vscode.window.showErrorMessage(
      "Code Review Agent: Set your Anthropic API key in Settings → Code Review → Anthropic Api Key or the ANTHROPIC_API_KEY environment variable."
    );
  }
  return key;
}

function getDefaultDimensions(): DimensionKey[] {
  return (
    vscode.workspace
      .getConfiguration("codeReview")
      .get<DimensionKey[]>("defaultDimensions") ?? []
  );
}

// ─── Chat participant ─────────────────────────────────────────────────────────

function createChatParticipant(context: vscode.ExtensionContext) {
  const participant = vscode.chat.createChatParticipant(
    PARTICIPANT_ID,
    async (
      request: vscode.ChatRequest,
      _ctx: vscode.ChatContext,
      stream: vscode.ChatResponseStream,
      token: vscode.CancellationToken
    ) => {
      const apiKey = getApiKey();
      if (!apiKey) return;

      const command = request.command; // "full" | "security" | "quick" | "file" | "explain" | undefined
      const userText = request.prompt.trim();

      // ── /project — review the entire workspace ──────────────────────────
      if (command === "project") {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceRoot) {
          stream.markdown("No workspace folder is open. Open a project folder first.");
          return;
        }
        await runProjectReview(workspaceRoot, apiKey, getDefaultDimensions(), userText || undefined, stream, token);
        return;
      }

      // ── /file — review currently open file ──────────────────────────────
      if (command === "file") {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
          stream.markdown("No file is currently open in the editor.");
          return;
        }
        const code = editor.document.getText();
        const filePath = editor.document.fileName;
        await runStreamingReview(
          code,
          apiKey,
          filePath,
          getDefaultDimensions(),
          userText || undefined,
          stream,
          token
        );
        return;
      }

      // ── /quick — fast security + blockers scan ───────────────────────────
      if (command === "quick") {
        const code = getCodeFromContext(request, userText);
        if (!code) {
          stream.markdown(
            "Please select some code in the editor, then run `@code-review /quick`."
          );
          return;
        }
        await runStreamingReview(
          code,
          apiKey,
          undefined,
          ["security", "critical_blockers", "vulnerabilities"],
          undefined,
          stream,
          token
        );
        return;
      }

      // ── /security — security + vulnerability scan ────────────────────────
      if (command === "security") {
        const code = getCodeFromContext(request, userText);
        if (!code) {
          stream.markdown("Please select some code or paste it in the message.");
          return;
        }
        await runStreamingReview(
          code,
          apiKey,
          undefined,
          ["security", "vulnerabilities"],
          undefined,
          stream,
          token
        );
        return;
      }

      // ── /explain — explain a specific finding ────────────────────────────
      if (command === "explain") {
        if (!userText) {
          stream.markdown(
            "Usage: `@code-review /explain <paste the finding title and description here>`"
          );
          return;
        }
        await explainFindingInChat(userText, apiKey, stream);
        return;
      }

      // ── default / /full — full review of selection or pasted code ────────
      const code = getCodeFromContext(request, userText);
      if (!code) {
        stream.markdown(
          [
            "## Code Review Agent",
            "",
            "I can review your code across 7 quality dimensions. Here's how to use me:",
            "",
            "| Command | Description |",
            "|---------|-------------|",
            "| `@code-review /full` | Full review of selected code (or paste code in message) |",
            "| `@code-review /file` | Review the currently open file |",
            "| `@code-review /security` | Security + vulnerability scan |",
            "| `@code-review /quick` | Fast security + critical blockers scan |",
            "| `@code-review /explain <finding>` | Deep explanation of a finding |",
            "",
            "**Tip:** Select code in the editor first, then run any command.",
          ].join("\n")
        );
        return;
      }

      await runStreamingReview(
        code,
        apiKey,
        undefined,
        command === "full" ? getDefaultDimensions() : getDefaultDimensions(),
        undefined,
        stream,
        token
      );
    }
  );

  participant.iconPath = vscode.Uri.joinPath(context.extensionUri, "icon.png");
  context.subscriptions.push(participant);
}

// ─── Streaming review helper ──────────────────────────────────────────────────

async function runStreamingReview(
  code: string,
  apiKey: string,
  filePath: string | undefined,
  dimensions: DimensionKey[],
  context: string | undefined,
  stream: vscode.ChatResponseStream,
  token: vscode.CancellationToken
): Promise<void> {
  let currentDimension = "";
  let result: ReviewResult | undefined;

  stream.progress("Starting code review...");

  try {
    result = await reviewCode(code, apiKey, {
      dimensions,
      filePath,
      context,
      onChunk: (dimension, chunk) => {
        if (token.isCancellationRequested) return;
        if (dimension !== currentDimension) {
          currentDimension = dimension;
          stream.progress(`Reviewing ${dimension}...`);
        }
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    stream.markdown(`**Error:** ${msg}`);
    return;
  }

  if (!result) return;

  // Summary line
  const summaryParts: string[] = [];
  if (result.criticalCount > 0)
    summaryParts.push(`🔴 ${result.criticalCount} critical`);
  if (result.highCount > 0) summaryParts.push(`🟠 ${result.highCount} high`);
  if (summaryParts.length === 0) summaryParts.push("✅ No critical/high findings");

  stream.markdown(
    `**Score:** ${result.compositeScore}/10 — Grade **${result.grade}** · ${summaryParts.join(" · ")}\n\n`
  );
  stream.markdown(result.markdownReport);

  // Offer to open as document
  stream.button({
    command: "codeReview.openReport",
    title: "Open Full Report",
    arguments: [result.markdownReport],
  });
}

// ─── Project-level review ─────────────────────────────────────────────────────

const SKIP_DIRS = new Set([
  "node_modules", ".git", "__pycache__", ".next", "dist", "build",
  "coverage", ".venv", "venv", ".expo", "out", ".turbo", ".cache",
]);
const SOURCE_EXTS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".py", ".java", ".kt", ".go",
  ".rb", ".cs", ".php", ".swift", ".rs",
]);

async function collectSourceFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  async function walk(dir: string) {
    const entries = await fs.readdir(dir).catch(() => [] as string[]);
    for (const name of entries) {
      if (SKIP_DIRS.has(name) || name.startsWith(".")) continue;
      const full = path.join(dir, name);
      const s = await fs.stat(full).catch(() => null);
      if (!s) continue;
      if (s.isDirectory()) await walk(full);
      else if (SOURCE_EXTS.has(path.extname(name).toLowerCase()) && s.size < 500 * 1024)
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
    const pkg = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf-8"));
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

async function runProjectReview(
  projectRoot: string,
  apiKey: string,
  dimensions: DimensionKey[],
  context: string | undefined,
  stream: vscode.ChatResponseStream,
  token: vscode.CancellationToken
): Promise<void> {
  stream.progress("Scanning project files...");
  const allFiles = await collectSourceFiles(projectRoot);
  const stackInfo = await detectStack(projectRoot, allFiles);
  stream.progress(`Found ${allFiles.length} source files (${stackInfo}). Starting review...`);

  // Run each dimension with agentic tool loop
  const Anthropic = require("@anthropic-ai/sdk").default;
  const client = new Anthropic({ apiKey });

  const SKIP_DIRS_SET = SKIP_DIRS;
  const FILE_TOOLS = [
    {
      name: "read_file",
      description: "Read a source file",
      input_schema: {
        type: "object",
        properties: {
          file_path: { type: "string" },
          start_line: { type: "number" },
          end_line: { type: "number" },
        },
        required: ["file_path"],
      },
    },
    {
      name: "list_directory",
      description: "List directory contents",
      input_schema: {
        type: "object",
        properties: { directory_path: { type: "string" } },
        required: ["directory_path"],
      },
    },
    {
      name: "glob_files",
      description: "Find files matching a pattern",
      input_schema: {
        type: "object",
        properties: {
          base_path: { type: "string" },
          pattern: { type: "string" },
        },
        required: ["base_path", "pattern"],
      },
    },
    {
      name: "search_in_files",
      description: "Search for a regex pattern across files",
      input_schema: {
        type: "object",
        properties: {
          base_path: { type: "string" },
          pattern: { type: "string" },
          file_extension: { type: "string" },
        },
        required: ["base_path", "pattern"],
      },
    },
  ];

  async function execTool(name: string, input: any): Promise<string> {
    function safePath(p: string): string {
      const abs = path.resolve(p);
      const rel = path.relative(projectRoot, abs);
      if (rel.startsWith("..")) throw new Error(`Path outside project: ${p}`);
      return abs;
    }
    try {
      switch (name) {
        case "read_file": {
          const fp = safePath(input.file_path);
          const content = await fs.readFile(fp, "utf-8");
          const lines = content.split("\n");
          const s = input.start_line ? Number(input.start_line) - 1 : 0;
          const e = input.end_line ? Number(input.end_line) : lines.length;
          return JSON.stringify({ file_path: fp, content: lines.slice(s, e).join("\n"), total_lines: lines.length });
        }
        case "list_directory": {
          const dp = safePath(input.directory_path);
          const entries = await fs.readdir(dp);
          const result = await Promise.all(
            entries
              .filter((e: string) => !SKIP_DIRS_SET.has(e) && !e.startsWith("."))
              .map(async (n: string) => {
                const full = path.join(dp, n);
                const s = await fs.stat(full).catch(() => null);
                return { name: n, type: s?.isDirectory() ? "directory" : "file" };
              })
          );
          return JSON.stringify({ directory: dp, entries: result });
        }
        case "glob_files": {
          const bp = safePath(input.base_path);
          const patBase = (input.pattern as string).replace(/\*\*\//g, "").replace(/\*/g, ".*");
          const re = new RegExp(patBase.replace(/\./g, "\\.") + "$");
          const matches = allFiles.filter((f: string) => re.test(f)).slice(0, 80);
          return JSON.stringify({ matches, count: matches.length });
        }
        case "search_in_files": {
          const bp = safePath(input.base_path);
          const ext = input.file_extension as string | undefined;
          const candidates = ext ? allFiles.filter((f: string) => f.endsWith(ext)) : allFiles;
          const re = new RegExp(input.pattern as string, "i");
          const hits: any[] = [];
          for (const file of candidates) {
            if (hits.length >= 40) break;
            const lines = (await fs.readFile(file, "utf-8").catch(() => "")).split("\n");
            for (let i = 0; i < lines.length; i++) {
              if (re.test(lines[i])) {
                hits.push({ file, line_number: i + 1, match: lines[i].trim() });
                if (hits.length >= 40) break;
              }
            }
          }
          return JSON.stringify({ matches: hits, count: hits.length });
        }
        default: return JSON.stringify({ error: `Unknown tool: ${name}` });
      }
    } catch (err) {
      return JSON.stringify({ error: String(err) });
    }
  }

  // Dimension meta (inline — avoids importing the full reviewer module)
  const DIMS: Record<string, { displayName: string; weight: number; systemPrompt: string }> = {
    security: { displayName: "Security", weight: 0.20, systemPrompt: "You are a security reviewer. Check for auth bypasses, XSS, injection, secrets, CORS, IDOR. Cite CWE IDs." },
    vulnerabilities: { displayName: "Vulnerabilities", weight: 0.15, systemPrompt: "You are a vulnerability researcher. Check for prototype pollution, ReDoS, SSRF, timing attacks, mass assignment." },
    critical_blockers: { displayName: "Critical Blockers", weight: 0.20, systemPrompt: "Check for unimplemented critical paths, crash risks, data integrity issues, missing transactions." },
    test_coverage: { displayName: "Test Coverage", weight: 0.15, systemPrompt: "Check for missing test files, untested critical paths, no edge cases, poor assertion quality." },
    tech_debt: { displayName: "Tech Debt", weight: 0.10, systemPrompt: "Check for TODO/FIXMEs, dead code, deprecated APIs, copy-paste duplication, magic numbers." },
    complexity: { displayName: "Complexity", weight: 0.10, systemPrompt: "Check for cyclomatic complexity >10, functions >50 lines, deep nesting, boolean trap parameters." },
    naming_conventions: { displayName: "Naming", weight: 0.10, systemPrompt: "Check for wrong case conventions, vague names, inconsistency, misleading names." },
  };

  const results: Array<{ dimension: string; displayName: string; score: number; weight: number; summary: string; findings: any[] }> = [];

  for (const dimKey of dimensions) {
    if (token.isCancellationRequested) break;
    const meta = DIMS[dimKey];
    if (!meta) continue;
    stream.progress(`Reviewing ${meta.displayName}...`);

    const systemPrompt = meta.systemPrompt + `\n\nYou are reviewing the ENTIRE project at: ${projectRoot}\nStack: ${stackInfo} | Files: ${allFiles.length}\n\nExplore using file tools, then return JSON:\n\`\`\`json\n{"score":<0-10>,"summary":"<assessment>","findings":[{"severity":"<CRITICAL|HIGH|MEDIUM|LOW>","title":"<title>","description":"<desc>","file_path":"<path>","line":<n|null>,"suggestion":"<fix>","cwe_id":"<CWE or null>"}]}\n\`\`\``;

    const messages: any[] = [
      { role: "user", content: context ? `Review the project for ${meta.displayName} issues.\n\nContext:\n${context}` : `Review the project for ${meta.displayName} issues using the file tools.` },
    ];

    let fullText = "";
    let toolCalls = 0;
    while (toolCalls < 20) {
      const resp = await client.messages.create({
        model: "claude-opus-4-6",
        max_tokens: 8096,
        thinking: { type: "adaptive" },
        system: systemPrompt,
        tools: FILE_TOOLS,
        messages,
      });
      for (const b of resp.content) {
        if (b.type === "text") fullText = b.text;
      }
      messages.push({ role: "assistant", content: resp.content });
      if (resp.stop_reason !== "tool_use") break;
      const toolResults: any[] = [];
      for (const b of resp.content) {
        if (b.type !== "tool_use") continue;
        toolCalls++;
        const result = await execTool(b.name, b.input);
        toolResults.push({ type: "tool_result", tool_use_id: b.id, content: result });
      }
      messages.push({ role: "user", content: toolResults });
    }

    // Parse JSON
    const jm = fullText.match(/```json\s*([\s\S]*?)```/);
    let score = 5; let summary = ""; let findings: any[] = [];
    try {
      const p = JSON.parse((jm ? jm[1] : fullText).trim());
      score = Math.min(10, Math.max(0, Number(p.score ?? 5)));
      summary = String(p.summary ?? "");
      findings = p.findings ?? [];
    } catch {}
    results.push({ dimension: dimKey, displayName: meta.displayName, score, weight: meta.weight, summary, findings });
  }

  // Composite score
  const totalW = results.reduce((s, r) => s + r.weight, 0);
  const composite = results.reduce((s, r) => s + r.score * r.weight, 0) / (totalW || 1);
  const grade = composite >= 9 ? "A+" : composite >= 8 ? "A" : composite >= 7 ? "B" : composite >= 6 ? "C" : composite >= 5 ? "D" : "F";
  const critCount = results.flatMap((r) => r.findings).filter((f) => f.severity === "CRITICAL").length;
  const highCount = results.flatMap((r) => r.findings).filter((f) => f.severity === "HIGH").length;

  // Stream the report
  stream.markdown(`## Project Review — ${path.basename(projectRoot)}\n\n`);
  stream.markdown(`**Stack:** ${stackInfo} · **Files:** ${allFiles.length} · **Score:** ${composite.toFixed(1)}/10 — Grade **${grade}**\n\n`);
  if (critCount > 0) stream.markdown(`> 🔴 ${critCount} critical finding(s) · `);
  if (highCount > 0) stream.markdown(`🟠 ${highCount} high finding(s)\n\n`);

  stream.markdown(`\n| Dimension | Score | Status |\n|-----------|-------|--------|\n`);
  for (const r of results) {
    const ok = r.score >= 7 ? "✅" : r.score >= 4 ? "⚠️" : "❌";
    stream.markdown(`| ${ok} ${r.displayName} | ${r.score.toFixed(1)}/10 | ${ok} |\n`);
  }

  // Critical findings
  const crits = results.flatMap((r) => r.findings.filter((f: any) => f.severity === "CRITICAL").map((f: any) => ({ ...f, dim: r.displayName })));
  if (crits.length > 0) {
    stream.markdown(`\n## 🔴 Critical Findings\n\n`);
    for (const f of crits) {
      stream.markdown(`**${f.title}** *(${f.dim})*`);
      if (f.file_path) stream.markdown(` — \`${f.file_path}\``);
      if (f.cwe_id) stream.markdown(` \`${f.cwe_id}\``);
      stream.markdown(`\n\n${f.description}\n\n> **Fix:** ${f.suggestion}\n\n`);
    }
  }

  stream.markdown(`\n## Detailed Findings\n\n`);
  for (const r of results) {
    stream.markdown(`### ${r.displayName} — ${r.score.toFixed(1)}/10\n\n${r.summary}\n\n`);
    const icon = (s: string) => ({ CRITICAL: "🔴", HIGH: "🟠", MEDIUM: "🟡", LOW: "🔵" }[s] ?? "⚪");
    for (const f of r.findings.filter((f: any) => f.severity !== "INFO")) {
      stream.markdown(`**${icon(f.severity)} ${f.severity} — ${f.title}**`);
      if (f.file_path) stream.markdown(` \`${f.file_path}\``);
      if (f.line) stream.markdown(` line ${f.line}`);
      stream.markdown(`\n\n${f.description}\n\n> **Suggestion:** ${f.suggestion}\n\n`);
    }
  }
}

// ─── Explain finding ──────────────────────────────────────────────────────────

async function explainFindingInChat(
  findingText: string,
  apiKey: string,
  stream: vscode.ChatResponseStream
): Promise<void> {
  const Anthropic = require("@anthropic-ai/sdk").default;
  const client = new Anthropic({ apiKey });

  stream.progress("Explaining finding...");

  const response = await client.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 2048,
    thinking: { type: "adaptive" },
    messages: [
      {
        role: "user",
        content: `Explain this code review finding in depth:

${findingText}

Provide:
1. **What it is** — clear explanation
2. **Why it matters** — business/security impact
3. **Attack scenario** (for security issues)
4. **Before/After code** — broken vs fixed pattern
5. **References** — CWE, OWASP, docs`,
      },
    ],
  });

  const text = response.content
    .filter((b: any) => b.type === "text")
    .map((b: any) => b.text)
    .join("");

  stream.markdown(text);
}

// ─── Editor commands ──────────────────────────────────────────────────────────

async function reviewSelectionCommand() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;

  const selection = editor.selection;
  const code = editor.document.getText(selection.isEmpty ? undefined : selection);
  const filePath = editor.document.fileName;
  const apiKey = getApiKey();
  if (!apiKey) return;

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Code Review Agent",
      cancellable: true,
    },
    async (progress, token) => {
      progress.report({ message: "Starting review..." });

      let result: ReviewResult;
      try {
        result = await reviewCode(code, apiKey, {
          filePath: selection.isEmpty ? filePath : undefined,
          dimensions: getDefaultDimensions(),
          onChunk: (dimension) => {
            progress.report({ message: `Reviewing ${dimension}...` });
          },
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Code Review failed: ${msg}`);
        return;
      }

      await openReportDocument(result.markdownReport);
    }
  );
}

async function reviewFileCommand() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage("Open a file in the editor first.");
    return;
  }
  const code = editor.document.getText();
  const filePath = editor.document.fileName;
  const apiKey = getApiKey();
  if (!apiKey) return;

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Reviewing ${filePath.split(/[/\\]/).pop()}`,
      cancellable: true,
    },
    async (progress) => {
      let result: ReviewResult;
      try {
        result = await reviewCode(code, apiKey, {
          filePath,
          dimensions: getDefaultDimensions(),
          onChunk: (dimension) => {
            progress.report({ message: `Reviewing ${dimension}...` });
          },
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Code Review failed: ${msg}`);
        return;
      }
      await openReportDocument(result.markdownReport);
    }
  );
}

async function reviewQuickCommand() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;
  const code = editor.document.getText();
  const filePath = editor.document.fileName;
  const apiKey = getApiKey();
  if (!apiKey) return;

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: "Quick Security Scan" },
    async (progress) => {
      let result: ReviewResult;
      try {
        result = await reviewCode(code, apiKey, {
          filePath,
          dimensions: ["security", "critical_blockers", "vulnerabilities"],
          onChunk: (dimension) => {
            progress.report({ message: `Scanning ${dimension}...` });
          },
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Scan failed: ${msg}`);
        return;
      }

      const criticals = result.dimensions
        .flatMap((d) => d.findings.filter((f) => f.severity === "CRITICAL"))
        .length;

      if (criticals > 0) {
        const action = await vscode.window.showWarningMessage(
          `Quick scan: ${criticals} critical issue(s) found (score ${result.compositeScore}/10)`,
          "View Full Report"
        );
        if (action === "View Full Report") {
          await openReportDocument(result.markdownReport);
        }
      } else {
        vscode.window.showInformationMessage(
          `Quick scan: No critical issues. Score ${result.compositeScore}/10`
        );
      }
    }
  );
}

async function reviewProjectCommand() {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) {
    vscode.window.showWarningMessage("Open a project folder first.");
    return;
  }
  const apiKey = getApiKey();
  if (!apiKey) return;

  // Let user optionally pick dimensions
  const ALL_DIMS = ["security", "vulnerabilities", "critical_blockers", "test_coverage", "tech_debt", "complexity", "naming_conventions"];
  const picks = await vscode.window.showQuickPick(
    ALL_DIMS.map((d) => ({ label: d, picked: true })),
    { canPickMany: true, placeHolder: "Select dimensions to review (all selected by default)" }
  );
  if (!picks || picks.length === 0) return;
  const dimensions = picks.map((p) => p.label) as DimensionKey[];

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: "Reviewing project...", cancellable: true },
    async (progress, token) => {
      const allFiles = await collectSourceFiles(workspaceRoot);
      const stackInfo = await detectStack(workspaceRoot, allFiles);
      progress.report({ message: `${allFiles.length} files · ${stackInfo}` });

      // Re-use the chat stream-compatible runner via a synthetic stream sink
      const markdownParts: string[] = [];
      const fakeSink = {
        progress: (msg: string) => progress.report({ message: msg }),
        markdown: (text: string) => markdownParts.push(text),
        button: () => {},
      } as unknown as vscode.ChatResponseStream;

      await runProjectReview(workspaceRoot, apiKey, dimensions, undefined, fakeSink, token);
      await openReportDocument(markdownParts.join(""));
    }
  );
}

// ─── Report document ──────────────────────────────────────────────────────────

async function openReportDocument(markdown: string) {
  const doc = await vscode.workspace.openTextDocument({
    content: markdown,
    language: "markdown",
  });
  await vscode.window.showTextDocument(doc, { preview: true });
  // Trigger markdown preview
  await vscode.commands.executeCommand(
    "markdown.showPreviewToSide",
    doc.uri
  );
}

// ─── Helper: get code from chat context or message ───────────────────────────

function getCodeFromContext(
  request: vscode.ChatRequest,
  userText: string
): string | null {
  // 1. Editor selection (via implicit context)
  const editor = vscode.window.activeTextEditor;
  if (editor && !editor.selection.isEmpty) {
    return editor.document.getText(editor.selection);
  }
  // 2. Code fences in the message
  const fenced = userText.match(/```[\w]*\n([\s\S]*?)```/);
  if (fenced) return fenced[1];
  // 3. Raw text if it looks like code (has indentation or semicolons)
  if (userText.includes("\n") && (userText.includes("  ") || userText.includes(";"))) {
    return userText;
  }
  return null;
}

// ─── Extension lifecycle ──────────────────────────────────────────────────────

export function activate(context: vscode.ExtensionContext) {
  createChatParticipant(context);

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "codeReview.reviewSelection",
      reviewSelectionCommand
    ),
    vscode.commands.registerCommand("codeReview.reviewFile", reviewFileCommand),
    vscode.commands.registerCommand("codeReview.reviewQuick", reviewQuickCommand),
    vscode.commands.registerCommand("codeReview.reviewProject", reviewProjectCommand),
    vscode.commands.registerCommand(
      "codeReview.openReport",
      async (markdown: string) => {
        await openReportDocument(markdown);
      }
    )
  );
}

export function deactivate() {}
