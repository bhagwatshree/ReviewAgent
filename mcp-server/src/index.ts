#!/usr/bin/env node
/**
 * Code Review MCP Server
 *
 * Exposes AI code review as MCP tools usable in:
 *  - VSCode (via GitHub Copilot + MCP or Claude VSCode extension)
 *  - Cursor IDE (native MCP support)
 *  - IntelliJ (via MCP plugin or HTTP bridge)
 *  - Claude Desktop
 *  - Any MCP-compatible client
 *
 * Usage: ANTHROPIC_API_KEY=sk-ant-... node dist/index.js
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { reviewCode, reviewFile, reviewProject } from "./reviewer.js";
import { ALL_DIMENSION_KEYS, DimensionKey } from "./dimensions.js";

const server = new Server(
  { name: "code-review", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

// ─── Tool definitions ────────────────────────────────────────────────────────

const tools: Tool[] = [
  {
    name: "review_selection",
    description:
      "Review a selected code snippet for quality issues across multiple dimensions: security, vulnerabilities, critical blockers, test coverage, tech debt, complexity, and naming conventions. Returns a scored Markdown report.",
    inputSchema: {
      type: "object",
      properties: {
        code: {
          type: "string",
          description: "The code snippet to review",
        },
        language: {
          type: "string",
          description:
            "Programming language (e.g. TypeScript, Python, Java). Auto-detected if omitted.",
        },
        file_path: {
          type: "string",
          description: "Source file path — used for language detection and report context.",
        },
        dimensions: {
          type: "array",
          items: { type: "string", enum: ALL_DIMENSION_KEYS },
          description:
            "Which dimensions to review. Defaults to all 7 if omitted.",
        },
        context: {
          type: "string",
          description:
            "Optional extra context: Jira ticket, feature spec, acceptance criteria. Helps Claude understand expected behavior.",
        },
      },
      required: ["code"],
    },
  },
  {
    name: "review_file",
    description:
      "Review an entire source file on disk. Reads the file, runs all requested review dimensions, and returns a scored Markdown report. Use this when the user right-clicks a file and selects 'Review File'.",
    inputSchema: {
      type: "object",
      properties: {
        file_path: {
          type: "string",
          description: "Absolute path to the file to review",
        },
        dimensions: {
          type: "array",
          items: { type: "string", enum: ALL_DIMENSION_KEYS },
          description: "Dimensions to run. Defaults to all 7.",
        },
        context: {
          type: "string",
          description: "Optional Jira ticket, spec, or acceptance criteria context.",
        },
      },
      required: ["file_path"],
    },
  },
  {
    name: "review_quick",
    description:
      "Fast security + critical blockers scan only. Use when the user wants a quick check before committing. Returns findings in under 30 seconds.",
    inputSchema: {
      type: "object",
      properties: {
        code: {
          type: "string",
          description: "Code to scan",
        },
        file_path: {
          type: "string",
          description: "Source file path for context",
        },
        language: {
          type: "string",
          description: "Programming language",
        },
      },
      required: ["code"],
    },
  },
  {
    name: "explain_finding",
    description:
      "Given a specific finding from a previous review (title + description), explain it in depth: what the vulnerability/issue is, how an attacker could exploit it (for security), a concrete before/after code example, and links to relevant documentation.",
    inputSchema: {
      type: "object",
      properties: {
        finding_title: {
          type: "string",
          description: "Title of the finding to explain",
        },
        finding_description: {
          type: "string",
          description: "Description of the finding",
        },
        code_snippet: {
          type: "string",
          description: "Relevant code snippet showing the issue",
        },
        language: {
          type: "string",
          description: "Programming language",
        },
      },
      required: ["finding_title", "finding_description"],
    },
  },
  {
    name: "review_project",
    description:
      "Review an entire project directory. Claude autonomously explores the codebase using file tools (read_file, list_directory, glob_files, search_in_files), then scores all requested dimensions. Use this for a full project audit — it scans every source file, detects the tech stack, and produces a project-level report with findings grouped by dimension.",
    inputSchema: {
      type: "object",
      properties: {
        project_root: {
          type: "string",
          description: "Absolute path to the project root directory",
        },
        dimensions: {
          type: "array",
          items: { type: "string", enum: ALL_DIMENSION_KEYS },
          description: "Dimensions to run. Defaults to all 7.",
        },
        context: {
          type: "string",
          description:
            "Optional context: Jira tickets, feature specs, known issues. Helps Claude focus the review.",
        },
      },
      required: ["project_root"],
    },
  },
  {
    name: "list_dimensions",
    description:
      "List all available review dimensions with their names, weights, and descriptions. Use this to show the user what the code review agent can check.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
];

// ─── Tool handlers ────────────────────────────────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "review_selection": {
        const result = await reviewCode(args!.code as string, {
          language: args!.language as string | undefined,
          filePath: args!.file_path as string | undefined,
          dimensions: args!.dimensions as DimensionKey[] | undefined,
          context: args!.context as string | undefined,
        });

        return {
          content: [
            {
              type: "text",
              text: formatReviewOutput(result),
            },
          ],
        };
      }

      case "review_file": {
        const result = await reviewFile(args!.file_path as string, {
          dimensions: args!.dimensions as DimensionKey[] | undefined,
          context: args!.context as string | undefined,
        });

        return {
          content: [
            {
              type: "text",
              text: formatReviewOutput(result),
            },
          ],
        };
      }

      case "review_project": {
        const progressLog: string[] = [];
        const result = await reviewProject(args!.project_root as string, {
          dimensions: args!.dimensions as DimensionKey[] | undefined,
          context: args!.context as string | undefined,
          onProgress: (msg) => {
            progressLog.push(msg);
            process.stderr.write(msg + "\n");
          },
        });

        const summary = [
          `**Project:** \`${result.projectRoot}\``,
          `**Stack:** ${result.stackInfo}`,
          `**Files scanned:** ${result.filesScanned}`,
          `**Score:** ${result.compositeScore}/10 — Grade **${result.grade}**`,
          result.criticalCount > 0 ? `🔴 ${result.criticalCount} critical finding(s)` : `✅ No critical findings`,
          result.highCount > 0 ? `🟠 ${result.highCount} high finding(s)` : "",
        ].filter(Boolean).join("  \n");

        return {
          content: [
            { type: "text", text: summary + "\n\n" + result.markdownReport },
          ],
        };
      }

      case "review_quick": {
        const result = await reviewCode(args!.code as string, {
          language: args!.language as string | undefined,
          filePath: args!.file_path as string | undefined,
          dimensions: ["security", "critical_blockers", "vulnerabilities"],
        });

        return {
          content: [
            {
              type: "text",
              text: formatReviewOutput(result),
            },
          ],
        };
      }

      case "explain_finding": {
        const explanation = await explainFinding(
          args!.finding_title as string,
          args!.finding_description as string,
          args!.code_snippet as string | undefined,
          args!.language as string | undefined
        );
        return { content: [{ type: "text", text: explanation }] };
      }

      case "list_dimensions": {
        const { DIMENSIONS } = await import("./dimensions.js");
        const lines = Object.values(DIMENSIONS).map(
          (d) =>
            `- **${d.displayName}** (\`${d.name}\`, weight ${(d.weight * 100).toFixed(0)}%)`
        );
        return {
          content: [
            {
              type: "text",
              text: `## Available Review Dimensions\n\n${lines.join("\n")}\n\nPass any subset via the \`dimensions\` parameter.`,
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: "text", text: `Error: ${message}` }],
      isError: true,
    };
  }
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface ReviewResult {
  compositeScore: number;
  grade: string;
  criticalCount: number;
  highCount: number;
  markdownReport: string;
}

function formatReviewOutput(result: ReviewResult): string {
  const summary: string[] = [];

  if (result.criticalCount > 0)
    summary.push(`🔴 ${result.criticalCount} critical finding(s)`);
  if (result.highCount > 0)
    summary.push(`🟠 ${result.highCount} high finding(s)`);

  const statusLine =
    summary.length > 0 ? `\n> ${summary.join(" · ")}\n` : "\n> ✅ No critical or high findings\n";

  return statusLine + "\n" + result.markdownReport;
}

async function explainFinding(
  title: string,
  description: string,
  codeSnippet?: string,
  language?: string
): Promise<string> {
  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const codeBlock = codeSnippet
    ? `\n\n**Relevant code:**\n\`\`\`${language ?? ""}\n${codeSnippet}\n\`\`\``
    : "";

  const response = await client.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 2048,
    thinking: { type: "adaptive" } as any,
    messages: [
      {
        role: "user",
        content: `Explain this code review finding in depth for a developer who needs to understand and fix it:

**Finding:** ${title}
**Description:** ${description}${codeBlock}

Please provide:
1. **What it is** — explain the issue clearly
2. **Why it matters** — business/security impact
3. **How to exploit it** (for security issues) — concrete attack scenario
4. **Before/After code** — show the broken pattern and the fixed version
5. **References** — relevant documentation, CWE, OWASP, etc.`,
      },
    ],
  });

  return response.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { type: "text"; text: string }).text)
    .join("");
}

// ─── Start server ─────────────────────────────────────────────────────────────

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    process.stderr.write(
      "Error: ANTHROPIC_API_KEY environment variable is required\n"
    );
    process.exit(1);
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write("Code Review MCP Server running on stdio\n");
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${err}\n`);
  process.exit(1);
});
