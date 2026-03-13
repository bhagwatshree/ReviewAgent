#!/usr/bin/env node

/**
 * CLI Entry Point - Universal Code Review Agent
 *
 * Usage:
 *   code-review-agent --file <path>             Review a single file (generates prompts)
 *   code-review-agent --project [path]          Review an entire project (generates prompts)
 *   code-review-agent --diff [args]             Review a diff (generates prompts)
 *   code-review-agent --report <path>           Generate HTML from prompt files
 *   code-review-agent --format html --result <path>  Convert JSON result to HTML
 *
 * No API key required — prompts are generated for your IDE's built-in LLM
 * (GitHub Copilot, Claude, etc.). For seamless review, register the MCP server
 * in your IDE and use @codeReviewBuddy in chat.
 */

import { readFile } from "fs/promises";
import { resolve } from "path";
import { generateReviewPrompts, formatPromptForManualEntry } from "./prompt-builder.js";
import { saveHTMLReport, saveHTMLFromResult } from "./html-reporter.js";
import { parseDiffArgs, fetchDiff } from "./diff-fetcher.js";
import { reviewDiff } from "./diff-reviewer.js";
import { reviewProject } from "./project-reviewer.js";
import type { CodeReviewRequest, ReviewDimension } from "./types.js";

// ─── Argument parser ──────────────────────────────────────────────────────────

interface ParsedArgs {
  filePath?: string;
  projectPath?: string;
  diffArg?: string;
  hasDiff: boolean;
  format?: "json" | "markdown" | "console" | "prompts" | "html";
  report?: string;
  result?: string;
  dimensions?: string;
  jira?: string;
  brs?: string;
  architecture?: string;
  figma?: string;
  helpRequested: boolean;
}

function parseArgs(): ParsedArgs {
  const args = process.argv.slice(2);
  const parsed: any = { helpRequested: false, hasDiff: false };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--help" || arg === "-h") {
      parsed.helpRequested = true;
    } else if (arg === "--file" || arg === "-f") {
      parsed.filePath = args[++i];
    } else if (arg === "--project") {
      parsed.projectPath = args[i + 1] && !args[i + 1].startsWith("--")
        ? args[++i]
        : process.cwd();
    } else if (arg === "--diff") {
      parsed.hasDiff = true;
      const parts: string[] = [];
      while (args[i + 1] && !args[i + 1].startsWith("--")) {
        parts.push(args[++i]);
      }
      parsed.diffArg = parts.join(" ");
    } else if (arg === "--format" || arg === "-o") {
      parsed.format = args[++i];
    } else if (arg === "--report") {
      parsed.report = args[++i];
    } else if (arg === "--result") {
      parsed.result = args[++i];
    } else if (arg === "--dimensions") {
      parsed.dimensions = args[++i];
    } else if (arg === "--api-key") {
      // Ignored — no API key required
      i++;
    } else if (arg === "--jira") {
      parsed.jira = args[++i];
    } else if (arg === "--brs") {
      parsed.brs = args[++i];
    } else if (arg === "--architecture") {
      parsed.architecture = args[++i];
    } else if (arg === "--figma") {
      parsed.figma = args[++i];
    }
  }
  return parsed;
}

function showHelp() {
  console.log(`
Universal Code Review Agent
AI-powered code review using your IDE's built-in LLM — no API key required

USAGE:
  code-review-agent --file <path>               Review a single file (generates prompts)
  code-review-agent --project [path]            Review entire project (generates prompts)
  code-review-agent --diff [ref|url]            Review code diff (generates prompts)
  code-review-agent --report <project-path>     Generate HTML from prompt files

DIFF MODES (--diff):
  --diff                         Last 2 commits (HEAD~1..HEAD)
  --diff remote                  Local HEAD vs upstream tracking branch
  --diff v1.2.3                  v1.2.3 vs HEAD
  --diff v1.0 v1.2               Between two refs
  --diff <github-compare-url>    Fetch diff via GitHub API
  --diff <gitlab-compare-url>    Fetch diff via GitLab API

OPTIONS:
  --file, -f <path>              Path to code file to review
  --project [path]               Project directory (defaults to current directory)
  --dimensions <list>            Comma-separated dimensions to review
                                 (security,vulnerabilities,critical_blockers,
                                  test_coverage,tech_debt,complexity,naming_conventions)
  --format, -o <format>          Output: json | markdown | console | prompts | html
  --report <path>                Generate HTML from prompt files in directory
  --result <path>                JSON result file (used with --format html)
  --jira <path>                  Path to Jira ticket
  --brs <path>                   Path to BRS document
  --architecture <path>          Path to architecture document
  --figma <path>                 Path to Figma export
  --help, -h                     Show this help

ENVIRONMENT VARIABLES:
  GITHUB_TOKEN                   Optional — for private GitHub repos
  GITLAB_TOKEN                   Required for GitLab diffs

IDE INTEGRATION (recommended):
  Register the MCP server in VS Code and use @codeReviewBuddy in chat:
    "mcp": { "servers": { "code-review": { "command": "node", "args": ["<mcp-server/dist/index.js>"] } } }

EXAMPLES:
  # Review a file (generates prompts for manual IDE entry)
  code-review-agent --file src/auth.ts

  # Review entire project (generates prompts)
  code-review-agent --project D:/MyApp

  # Review last 2 commits (generates prompts)
  code-review-agent --diff

  # Review from GitHub compare URL
  code-review-agent --diff "https://github.com/owner/repo/compare/v1...v2"

  # Review only security dimensions
  code-review-agent --project . --dimensions security,vulnerabilities
`);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ALL_DIMENSIONS: ReviewDimension[] = [
  "security",
  "vulnerabilities",
  "critical_blockers",
  "test_coverage",
  "tech_debt",
  "complexity",
  "naming_conventions",
];

function getDimensions(raw?: string): ReviewDimension[] {
  if (!raw) return ALL_DIMENSIONS;
  return raw.split(",").map((d) => d.trim()) as ReviewDimension[];
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const parsed = parseArgs();

  if (parsed.helpRequested) {
    showHelp();
    process.exit(0);
  }

  // ── --report: generate HTML from prompt files ───────────────────────────
  if (parsed.report) {
    try {
      console.error(`\n📊 Generating HTML report from: ${parsed.report}`);
      const reportPath = await saveHTMLReport(resolve(parsed.report));
      console.error(`\n✅ Report: ${reportPath}`);
      process.exit(0);
    } catch (err) {
      console.error("❌ Error:", err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  }

  // ── --diff: generate review prompts for a diff ──────────────────────────
  if (parsed.hasDiff) {
    const dimensions = getDimensions(parsed.dimensions);
    const diffArgs = parseDiffArgs(parsed.diffArg ?? "");

    if (diffArgs.type === "same") {
      console.error(
        `\n⚠️  Both versions are the same (${diffArgs.from}). Running project review instead...\n`
      );
      const root = resolve(process.cwd());
      await reviewProject(root, "", dimensions, {
        onProgress: (msg) => console.error(`  ⟳  ${msg}`),
      });
      process.exit(0);
    }

    console.error(
      `\n🔍 Fetching diff: ${parsed.diffArg || "(last 2 commits)"} ...`
    );
    let diffResult: { diff: string; description: string };
    try {
      diffResult = await fetchDiff(diffArgs, process.cwd());
    } catch (err) {
      console.error("❌ Error fetching diff:", err instanceof Error ? err.message : String(err));
      process.exit(1);
    }

    if (!diffResult.diff.trim()) {
      console.error("\n✅ No changes found between the specified versions.");
      process.exit(0);
    }

    const diffLines = diffResult.diff.split("\n").length;
    console.error(`\n📄 Diff: ${diffLines} lines — ${diffResult.description}`);

    await reviewDiff(diffResult.diff, diffResult.description, "", dimensions, {
      onProgress: (msg) => console.error(`  ⟳  ${msg}`),
    });

    process.exit(0);
  }

  // ── --project: generate review prompts for a project ───────────────────
  if (parsed.projectPath) {
    const root = resolve(parsed.projectPath);
    const dimensions = getDimensions(parsed.dimensions);

    console.error(`\n🗂️  Reviewing project: ${root}`);

    const result = await reviewProject(root, "", dimensions, {
      onProgress: (msg) => console.error(`  ⟳  ${msg}`),
    }).catch((err) => {
      console.error("❌ Error:", err instanceof Error ? err.message : String(err));
      process.exit(1);
    });

    if (parsed.format === "html") {
      const outPath = resolve(root, "code-review-project-report.html");
      await saveHTMLFromResult(result, outPath, root);
      console.error(`\n✅ HTML report: ${outPath}`);
    } else if (parsed.format === "json") {
      console.log(JSON.stringify(result, null, 2));
    }

    process.exit(0);
  }

  // ── --file: review a single file ────────────────────────────────────────
  if (parsed.filePath) {
    const format = parsed.format || "prompts";

    if (format === "html") {
      if (!parsed.result) {
        console.error(
          "\n❌ --format html requires --result <path-to-review.json>\n"
        );
        process.exit(1);
      }
      const jsonText = await readFile(resolve(parsed.result), "utf-8");
      const reviewData = JSON.parse(jsonText);
      const r = {
        dimensions: reviewData.dimensions ?? [],
        compositeScore: reviewData.score?.composite ?? reviewData.compositeScore ?? 5,
        grade: reviewData.score?.grade ?? reviewData.grade ?? "C",
      };
      const outPath = resolve(parsed.filePath.replace(/\.[^.]+$/, "") + "-review.html");
      await saveHTMLFromResult(r, outPath, parsed.filePath);
      console.error(`\n✅ HTML report: ${outPath}`);
      process.exit(0);
    }

    console.error(`\n📄 Reading file: ${parsed.filePath}`);
    const code = await readFile(resolve(parsed.filePath), "utf-8").catch((err) => {
      console.error("❌ Error reading file:", err.message);
      process.exit(1);
    });

    const request: CodeReviewRequest = {
      code,
      filePath: parsed.filePath,
      businessContext: {
        jiraPath: parsed.jira,
        brsPath: parsed.brs,
        architecturePath: parsed.architecture,
        figmaPath: parsed.figma,
      },
    };

    console.error(`\n🔄 Generating review prompts...\n`);
    const result = await generateReviewPrompts(request);
    console.log(`\n${"=".repeat(80)}`);
    console.log(`Universal Code Review — Manual IDE Entry Mode`);
    console.log(`${"=".repeat(80)}\n`);
    for (const prompt of result.prompts) {
      console.log(formatPromptForManualEntry(prompt));
    }
    console.log(`\n${"=".repeat(80)}`);
    console.log(`NEXT STEPS:`);
    console.log(`1. Copy each prompt into your IDE's chat`);
    console.log(`2. Save the JSON response and run with --format html --result <file>`);
    console.log(`${"=".repeat(80)}\n`);

    process.exit(0);
  }

  // No mode selected
  showHelp();
  process.exit(1);
}

main().catch((err) => {
  console.error("❌ Fatal:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
