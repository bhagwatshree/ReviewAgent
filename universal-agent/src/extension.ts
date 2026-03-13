/**
 * @reviewbuddy — VS Code Chat Participant
 *
 * Uses the IDE's built-in LLM (GitHub Copilot, Claude, etc.) — no API key needed.
 * Requires VSCode 1.95+ (Chat Participant API + Language Model API)
 *
 * Commands:
 *   @reviewbuddy /file        — review the currently open file
 *   @reviewbuddy /project     — review the entire project folder
 *   @reviewbuddy /diff        — review last 2 commits
 *   @reviewbuddy /diff v1 v2  — review between two refs
 *   @reviewbuddy /security    — security + vulnerability scan
 *   @reviewbuddy /quick       — fast security + critical blockers
 *   @reviewbuddy /full        — full 7-dimension review of selection
 */

import * as vscode from "vscode";
import * as path from "path";
import * as fsSync from "fs";
import { collectSourceFiles, detectStack } from "./project-reviewer.js";
import { parseDiffArgs, fetchDiff } from "./diff-fetcher.js";

const PARTICIPANT_ID = "review.buddy";

// ─── Dimension definitions ────────────────────────────────────────────────────

type DimKey =
  | "security" | "vulnerabilities" | "critical_blockers"
  | "test_coverage" | "tech_debt" | "complexity" | "naming_conventions";

const DIMS: Record<DimKey, { displayName: string; weight: number; prompt: string }> = {
  security: {
    displayName: "Security", weight: 0.20,
    prompt: "You are a security reviewer. Check for auth bypasses, XSS, SQL injection, hardcoded secrets, CORS, IDOR, path traversal, command injection. Cite CWE IDs.",
  },
  vulnerabilities: {
    displayName: "Vulnerabilities", weight: 0.15,
    prompt: "You are a vulnerability researcher. Check for prototype pollution, ReDoS, SSRF, timing attacks, mass assignment, open redirect, race conditions.",
  },
  critical_blockers: {
    displayName: "Critical Blockers", weight: 0.20,
    prompt: "You are a senior engineer. Check for unimplemented TODOs in critical paths, crash risks, data integrity issues, missing transactions, business logic errors.",
  },
  test_coverage: {
    displayName: "Test Coverage", weight: 0.15,
    prompt: "You are a testing specialist. Check for missing test files, untested critical paths, missing edge cases, poor assertion quality, over-mocking.",
  },
  tech_debt: {
    displayName: "Tech Debt", weight: 0.10,
    prompt: "You are a software architect. Check for TODO/FIXME comments, dead code, deprecated APIs, copy-paste duplication, god functions, magic numbers.",
  },
  complexity: {
    displayName: "Complexity", weight: 0.10,
    prompt: "You are a code quality engineer. Check for cyclomatic complexity >10, functions >50 lines, deep nesting, long parameter lists, nested ternaries.",
  },
  naming_conventions: {
    displayName: "Naming", weight: 0.10,
    prompt: "You are a naming specialist. Check for wrong case conventions, vague names (data/info/temp/result), misleading names, inconsistent naming, bad abbreviations.",
  },
};

const ALL_DIMS = Object.keys(DIMS) as DimKey[];
const SECURITY_DIMS: DimKey[] = ["security", "vulnerabilities"];
const QUICK_DIMS: DimKey[] = ["security", "critical_blockers", "vulnerabilities"];

const JSON_BLOCK = `\`\`\`json
{"score":<0-10>,"summary":"<2-3 sentence assessment>","findings":[{"severity":"<CRITICAL|HIGH|MEDIUM|LOW|INFO>","title":"<short title>","description":"<issue and why it matters>","line":<line number or null>,"suggestion":"<concrete fix>","cwe_id":"<CWE-NNN or null>"}]}
\`\`\`

List only real issues. Return empty findings array with a high score if the code is clean.`;

// ─── Review helpers ───────────────────────────────────────────────────────────

function buildPrompt(code: string, dimKey: DimKey, filePath?: string, context?: string): string {
  const dim = DIMS[dimKey];
  const fileRef = filePath ? `\nFile: \`${filePath}\`` : "";
  const ctxBlock = context ? `\n\n**Context:**\n${context}` : "";
  return `${dim.prompt}\n\nReview the following code for **${dim.displayName}** issues.${fileRef}${ctxBlock}\n\n\`\`\`\n${code}\n\`\`\`\n\nReturn your review as:\n${JSON_BLOCK}`;
}

function parseResponse(text: string): { score: number; summary: string; findings: any[] } {
  const m = text.match(/```json\s*([\s\S]*?)```/);
  try {
    const p = JSON.parse((m ? m[1] : text).trim());
    return {
      score: Math.min(10, Math.max(0, Number(p.score ?? 5))),
      summary: String(p.summary ?? ""),
      findings: p.findings ?? [],
    };
  } catch {
    return { score: 5, summary: "Review completed", findings: [] };
  }
}

function scoreToGrade(s: number) {
  if (s >= 9) return "A+"; if (s >= 8) return "A"; if (s >= 7) return "B";
  if (s >= 6) return "C"; if (s >= 5) return "D"; return "F";
}

function severityIcon(s: string) {
  return ({ CRITICAL: "🔴", HIGH: "🟠", MEDIUM: "🟡", LOW: "🔵", INFO: "⚪" }[s] ?? "⚪");
}

async function askModel(model: vscode.LanguageModelChat, prompt: string, token: vscode.CancellationToken): Promise<string> {
  const resp = await model.sendRequest([vscode.LanguageModelChatMessage.User(prompt)], {}, token);
  let text = "";
  for await (const chunk of resp.text) text += chunk;
  return text;
}

// ─── Code review runner ───────────────────────────────────────────────────────

async function runCodeReview(
  code: string,
  model: vscode.LanguageModelChat,
  dims: DimKey[],
  stream: vscode.ChatResponseStream,
  token: vscode.CancellationToken,
  filePath?: string,
  context?: string
) {
  const results: { dim: DimKey; displayName: string; weight: number; score: number; summary: string; findings: any[] }[] = [];

  for (const dimKey of dims) {
    if (token.isCancellationRequested) break;
    const dim = DIMS[dimKey];
    stream.progress(`Reviewing ${dim.displayName}...`);

    try {
      const text = await askModel(model, buildPrompt(code, dimKey, filePath, context), token);
      const parsed = parseResponse(text);
      results.push({ dim: dimKey, displayName: dim.displayName, weight: dim.weight, ...parsed });
    } catch {
      results.push({ dim: dimKey, displayName: dim.displayName, weight: dim.weight, score: 5, summary: "Review skipped.", findings: [] });
    }
  }

  renderReport(results, stream, filePath);
}

function renderReport(
  results: { displayName: string; weight: number; score: number; summary: string; findings: any[] }[],
  stream: vscode.ChatResponseStream,
  target?: string
) {
  const totalW = results.reduce((s, r) => s + r.weight, 0);
  const composite = results.reduce((s, r) => s + r.score * r.weight, 0) / (totalW || 1);
  const grade = scoreToGrade(composite);
  const bar = (s: number) => `${"█".repeat(Math.round(s))}${"░".repeat(10 - Math.round(s))} ${s.toFixed(1)}/10`;

  stream.markdown(`## Code Review Report\n\n`);
  if (target) stream.markdown(`**Target:** \`${target}\`  \n`);
  stream.markdown(`**Score:** ${composite.toFixed(1)}/10 — Grade **${grade}**\n\n\`\`\`\n${bar(composite)}\n\`\`\`\n\n`);

  stream.markdown(`| Dimension | Score | Weight |\n|-----------|-------|--------|\n`);
  for (const r of results) {
    const ok = r.score >= 7 ? "✅" : r.score >= 4 ? "⚠️" : "❌";
    stream.markdown(`| ${ok} ${r.displayName} | ${r.score.toFixed(1)}/10 | ${(r.weight * 100).toFixed(0)}% |\n`);
  }

  const crits = results.flatMap(r => r.findings.filter(f => f.severity === "CRITICAL").map(f => ({ ...f, dim: r.displayName })));
  if (crits.length > 0) {
    stream.markdown(`\n## 🔴 Critical Findings\n\n`);
    for (const f of crits) {
      stream.markdown(`### ${f.title} *(${f.dim})*\n`);
      if (f.cwe_id) stream.markdown(`**${f.cwe_id}** · `);
      if (f.line) stream.markdown(`Line ${f.line} · `);
      stream.markdown(`\n${f.description}\n\n> **Fix:** ${f.suggestion}\n\n---\n\n`);
    }
  }

  stream.markdown(`\n## Detailed Findings\n\n`);
  for (const r of results) {
    stream.markdown(`### ${r.displayName} — ${r.score.toFixed(1)}/10\n\n${r.summary}\n\n`);
    if (r.findings.length === 0) {
      stream.markdown(`_No issues found._\n\n`);
    } else {
      for (const f of r.findings) {
        stream.markdown(`**${severityIcon(f.severity)} ${f.severity} — ${f.title}**`);
        if (f.line) stream.markdown(` (line ${f.line})`);
        if (f.cwe_id) stream.markdown(` \`${f.cwe_id}\``);
        stream.markdown(`\n\n${f.description}\n\n> **Suggestion:** ${f.suggestion}\n\n`);
      }
    }
  }
}

// ─── Project review ───────────────────────────────────────────────────────────

async function runProjectReview(
  root: string,
  model: vscode.LanguageModelChat,
  dims: DimKey[],
  stream: vscode.ChatResponseStream,
  token: vscode.CancellationToken
) {
  stream.progress("Scanning project files...");
  const files = await collectSourceFiles(root);
  const stack = await detectStack(root, files);
  stream.markdown(`**Stack:** ${stack} | **Files:** ${files.length}\n\n`);

  // Bundle up to 80 KB of source
  let bundle = "", size = 0;
  const MAX = 80 * 1024;
  for (const f of files) {
    if (size >= MAX) break;
    try {
      const content = fsSync.readFileSync(f, "utf-8");
      const entry = `\n\n// ─── ${path.relative(root, f)} ───\n${content}`;
      bundle += entry; size += entry.length;
    } catch {}
  }
  if (size >= MAX) bundle += "\n\n// ... [truncated]";

  const header = `Project: ${root}\nStack: ${stack}\nFiles: ${files.length}`;
  const code = `${header}\n\n${bundle}`;
  await runCodeReview(code, model, dims, stream, token, root);
}

// ─── Diff review ──────────────────────────────────────────────────────────────

async function runDiffReview(
  diff: string,
  description: string,
  model: vscode.LanguageModelChat,
  dims: DimKey[],
  stream: vscode.ChatResponseStream,
  token: vscode.CancellationToken
) {
  const truncated = diff.length > 50000 ? diff.slice(0, 50000) + "\n\n... [diff truncated]" : diff;

  const results: any[] = [];
  for (const dimKey of dims) {
    if (token.isCancellationRequested) break;
    const dim = DIMS[dimKey];
    stream.progress(`Reviewing ${dim.displayName}...`);
    const prompt = `${dim.prompt}\n\nFocus ONLY on new/changed code in this diff.\nContext: ${description}\n\n\`\`\`diff\n${truncated}\n\`\`\`\n\nReturn your review as:\n${JSON_BLOCK}`;
    try {
      const text = await askModel(model, prompt, token);
      const parsed = parseResponse(text);
      results.push({ displayName: dim.displayName, weight: dim.weight, ...parsed });
    } catch {
      results.push({ displayName: dim.displayName, weight: dim.weight, score: 5, summary: "Review skipped.", findings: [] });
    }
  }
  renderReport(results, stream, description);
}

// ─── Chat participant ─────────────────────────────────────────────────────────

export function activate(context: vscode.ExtensionContext) {
  const participant = vscode.chat.createChatParticipant(
    PARTICIPANT_ID,
    async (
      request: vscode.ChatRequest,
      _ctx: vscode.ChatContext,
      stream: vscode.ChatResponseStream,
      token: vscode.CancellationToken
    ) => {
      const model = request.model;
      const cmd = request.command;
      const userText = request.prompt.trim();

      // ── /project ───────────────────────────────────────────────────────────
      if (cmd === "project") {
        const root = userText || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!root) { stream.markdown("No folder path provided. Usage: `@reviewbuddy /project D:/path`"); return; }
        if (!fsSync.existsSync(root)) { stream.markdown(`Cannot access \`${root}\``); return; }
        stream.markdown(`**Reviewing project:** \`${root}\`\n\n`);
        await runProjectReview(root, model, ALL_DIMS, stream, token);
        return;
      }

      // ── /file ──────────────────────────────────────────────────────────────
      if (cmd === "file") {
        const editor = vscode.window.activeTextEditor;
        if (!editor) { stream.markdown("No file is currently open."); return; }
        stream.markdown(`**Reviewing file:** \`${editor.document.fileName}\`\n\n`);
        await runCodeReview(editor.document.getText(), model, ALL_DIMS, stream, token, editor.document.fileName);
        return;
      }

      // ── /security ──────────────────────────────────────────────────────────
      if (cmd === "security") {
        const editor = vscode.window.activeTextEditor;
        const code = editor?.document.getText() || userText;
        if (!code) { stream.markdown("Open a file or select code, then run `@reviewbuddy /security`."); return; }
        await runCodeReview(code, model, SECURITY_DIMS, stream, token, editor?.document.fileName);
        return;
      }

      // ── /quick ─────────────────────────────────────────────────────────────
      if (cmd === "quick") {
        const editor = vscode.window.activeTextEditor;
        const sel = editor?.selection;
        const code = (sel && !sel.isEmpty) ? editor!.document.getText(sel) : editor?.document.getText() || userText;
        if (!code) { stream.markdown("Open a file or select code, then run `@reviewbuddy /quick`."); return; }
        await runCodeReview(code, model, QUICK_DIMS, stream, token, editor?.document.fileName);
        return;
      }

      // ── /diff ──────────────────────────────────────────────────────────────
      if (cmd === "diff") {
        const projectRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        const diffArgs = parseDiffArgs(userText);

        if (diffArgs.type === "same") {
          stream.markdown(`Both versions are the same. Running full project review instead...\n\n`);
          if (!projectRoot) { stream.markdown("No workspace folder open."); return; }
          await runProjectReview(projectRoot, model, ALL_DIMS, stream, token);
          return;
        }

        stream.progress("Fetching diff...");
        try {
          const cwd = projectRoot || process.cwd();
          const result = await fetchDiff(diffArgs, cwd);
          if (!result.diff.trim()) { stream.markdown("No changes found."); return; }
          stream.markdown(`**Diff:** \`${result.description}\` — ${result.diff.split("\n").length} lines\n\n`);
          await runDiffReview(result.diff, result.description, model, ALL_DIMS, stream, token);
        } catch (err) {
          stream.markdown(`**Error fetching diff:** ${err instanceof Error ? err.message : String(err)}`);
        }
        return;
      }

      // ── /full or default ───────────────────────────────────────────────────
      const editor = vscode.window.activeTextEditor;
      const sel = editor?.selection;
      const code = (sel && !sel.isEmpty)
        ? editor!.document.getText(sel)
        : editor?.document.getText()
        || userText;

      if (!code) {
        stream.markdown([
          "## @reviewbuddy — Code Review Agent",
          "",
          "AI code review using your IDE's built-in LLM — no API key needed.",
          "",
          "| Command | Description |",
          "|---------|-------------|",
          "| `@reviewbuddy /full` | Full review of current file or selection |",
          "| `@reviewbuddy /file` | Review the currently open file |",
          "| `@reviewbuddy /security` | Security + vulnerability scan |",
          "| `@reviewbuddy /quick` | Fast security + critical blockers |",
          "| `@reviewbuddy /diff` | Review last 2 commits |",
          "| `@reviewbuddy /diff v1.0 v1.2` | Between two refs |",
          "| `@reviewbuddy /diff <github-url>` | GitHub/GitLab compare URL |",
          "| `@reviewbuddy /project [path]` | Review entire project folder |",
          "",
          "Open a file or select code, then run any command above.",
        ].join("\n"));
        return;
      }

      await runCodeReview(code, model, ALL_DIMS, stream, token, editor?.document.fileName);
    }
  );

  participant.iconPath = new vscode.ThemeIcon("shield");
  context.subscriptions.push(participant);
}

export function deactivate() {}
