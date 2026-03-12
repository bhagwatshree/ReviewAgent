/**
 * Core review engine for the VSCode extension.
 * Mirrors the MCP server reviewer but uses vscode.window for progress UI.
 */

import Anthropic from "@anthropic-ai/sdk";

export type DimensionKey =
  | "security"
  | "vulnerabilities"
  | "critical_blockers"
  | "test_coverage"
  | "tech_debt"
  | "complexity"
  | "naming_conventions";

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
}

export interface ReviewResult {
  compositeScore: number;
  grade: string;
  dimensions: DimensionResult[];
  criticalCount: number;
  highCount: number;
  markdownReport: string;
}

const DIMENSION_META: Record<DimensionKey, { displayName: string; weight: number; systemPrompt: string }> = {
  security: {
    displayName: "Security",
    weight: 0.20,
    systemPrompt: `You are a security-focused code reviewer. Check for: auth bypasses, XSS, SQL injection, hardcoded secrets, CORS misconfigurations, IDOR, missing rate limiting, JWT weaknesses, path traversal, command injection. Cite CWE IDs.`,
  },
  vulnerabilities: {
    displayName: "Vulnerabilities",
    weight: 0.15,
    systemPrompt: `You are a vulnerability researcher. Check for: CVE-prone dependency patterns, prototype pollution, ReDoS, SSRF, timing attacks, mass assignment, open redirect, zip slip, race conditions.`,
  },
  critical_blockers: {
    displayName: "Critical Blockers",
    weight: 0.20,
    systemPrompt: `You are a senior engineer checking for blockers that would prevent production deployment. Check for: unimplemented TODOs in critical paths, crash risks, data integrity issues, missing transactions, business logic errors.`,
  },
  test_coverage: {
    displayName: "Test Coverage",
    weight: 0.15,
    systemPrompt: `You are a testing specialist. Check for: missing test files, untested critical paths, lack of edge cases, no error path tests, poor assertion quality, over-mocking.`,
  },
  tech_debt: {
    displayName: "Tech Debt",
    weight: 0.10,
    systemPrompt: `You are a software architect checking for tech debt. Check for: TODO/FIXME comments, dead code, deprecated APIs, copy-paste duplication, god functions, magic numbers, missing abstractions.`,
  },
  complexity: {
    displayName: "Complexity",
    weight: 0.10,
    systemPrompt: `You are a code quality engineer. Check for: cyclomatic complexity > 10, functions > 50 lines, deep nesting, long parameter lists, nested ternaries, mixed abstraction levels, boolean trap parameters.`,
  },
  naming_conventions: {
    displayName: "Naming Conventions",
    weight: 0.10,
    systemPrompt: `You are a code quality reviewer specializing in naming. Check for: wrong case conventions, vague names (data/info/temp/result), misleading names, inconsistent naming for the same concept, bad abbreviations.`,
  },
};

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
      ts: "TypeScript", tsx: "TypeScript", js: "JavaScript", jsx: "JavaScript",
      py: "Python", java: "Java", kt: "Kotlin", go: "Go",
      rb: "Ruby", cs: "C#", php: "PHP", swift: "Swift", rs: "Rust",
    };
    if (ext && extMap[ext]) return extMap[ext];
  }
  if (code.includes("import React") || code.includes("useState")) return "TypeScript";
  if (code.includes("def ") && code.includes(":")) return "Python";
  return "TypeScript";
}

function parseResponse(text: string): { score: number; summary: string; findings: Finding[] } {
  const jsonMatch = text.match(/```json\s*([\s\S]*?)```/);
  const raw = jsonMatch ? jsonMatch[1] : text;
  try {
    const p = JSON.parse(raw.trim());
    return {
      score: Math.min(10, Math.max(0, Number(p.score ?? 5))),
      summary: String(p.summary ?? ""),
      findings: (p.findings ?? []).map((f: any) => ({
        severity: f.severity ?? "INFO",
        title: f.title ?? "Finding",
        description: f.description ?? "",
        line: f.line ?? undefined,
        suggestion: f.suggestion ?? "",
        cwe_id: f.cwe_id ?? undefined,
      })),
    };
  } catch {
    const m = text.match(/"score"\s*:\s*(\d+(?:\.\d+)?)/);
    return { score: m ? parseFloat(m[1]) : 5, summary: "Parsing failed", findings: [] };
  }
}

function buildMarkdown(
  filePath: string | undefined,
  language: string,
  results: DimensionResult[],
  composite: number,
  grade: string
): string {
  const bar = (s: number) =>
    `[${"#".repeat(Math.round(s))}${"·".repeat(10 - Math.round(s))}] ${s.toFixed(1)}/10`;

  const icon = (s: string) =>
    ({ CRITICAL: "🔴", HIGH: "🟠", MEDIUM: "🟡", LOW: "🔵", INFO: "⚪" }[s] ?? "⚪");

  const target = filePath ? `\`${filePath}\`` : "selected code";

  let md = `# Code Review Report\n\n`;
  md += `**Target:** ${target}  \n**Language:** ${language}  \n**Score:** ${composite.toFixed(1)}/10 — Grade **${grade}**\n\n`;
  md += "```\nOverall  " + bar(composite) + "\n```\n\n";
  md += `| Dimension | Score | Weight |\n|-----------|-------|--------|\n`;
  for (const r of results) {
    const ok = r.score >= 7 ? "✅" : r.score >= 4 ? "⚠️" : "❌";
    md += `| ${ok} ${r.displayName} | ${r.score.toFixed(1)}/10 | ${(r.weight * 100).toFixed(0)}% |\n`;
  }

  const crits = results.flatMap((r) =>
    r.findings.filter((f) => f.severity === "CRITICAL").map((f) => ({ ...f, dim: r.displayName }))
  );
  if (crits.length > 0) {
    md += `\n## 🔴 Critical Findings\n\n`;
    for (const f of crits) {
      md += `### ${f.title} *(${f.dim})*\n`;
      if (f.cwe_id) md += `**${f.cwe_id}** · `;
      if (f.line) md += `Line ${f.line} · `;
      md += `\n${f.description}\n\n> **Fix:** ${f.suggestion}\n\n---\n\n`;
    }
  }

  md += `\n## Detailed Findings\n\n`;
  for (const r of results) {
    md += `### ${r.displayName} — ${r.score.toFixed(1)}/10\n\n${r.summary}\n\n`;
    if (r.findings.length === 0) {
      md += `_No issues found._\n\n`;
    } else {
      for (const f of r.findings) {
        md += `**${icon(f.severity)} ${f.severity} — ${f.title}**`;
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
  apiKey: string,
  options: {
    dimensions?: DimensionKey[];
    language?: string;
    filePath?: string;
    context?: string;
    onChunk?: (dimension: string, text: string) => void;
  } = {}
): Promise<ReviewResult> {
  const client = new Anthropic({ apiKey });
  const dims = options.dimensions ?? (Object.keys(DIMENSION_META) as DimensionKey[]);
  const language = options.language ?? detectLanguage(code, options.filePath);
  const results: DimensionResult[] = [];

  for (const dimKey of dims) {
    const meta = DIMENSION_META[dimKey];
    options.onChunk?.(meta.displayName, "");

    let fullText = "";
    const stream = client.messages.stream({
      model: "claude-opus-4-6",
      max_tokens: 3072,
      thinking: { type: "adaptive" } as any,
      system: meta.systemPrompt,
      messages: [
        {
          role: "user",
          content: buildPrompt(code, language, options.filePath, options.context, dimKey),
        },
      ],
    });

    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        fullText += event.delta.text;
        options.onChunk?.(meta.displayName, event.delta.text);
      }
    }

    const parsed = parseResponse(fullText);
    results.push({
      dimension: dimKey,
      displayName: meta.displayName,
      score: parsed.score,
      weight: meta.weight,
      summary: parsed.summary,
      findings: parsed.findings,
    });
  }

  const totalWeight = results.reduce((s, r) => s + r.weight, 0);
  const composite =
    results.reduce((s, r) => s + r.score * r.weight, 0) / (totalWeight || 1);

  const criticalCount = results
    .flatMap((r) => r.findings)
    .filter((f) => f.severity === "CRITICAL").length;
  const highCount = results
    .flatMap((r) => r.findings)
    .filter((f) => f.severity === "HIGH").length;

  const grade = scoreToGrade(composite);
  const markdownReport = buildMarkdown(
    options.filePath,
    language,
    results,
    composite,
    grade
  );

  return {
    compositeScore: Math.round(composite * 10) / 10,
    grade,
    dimensions: results,
    criticalCount,
    highCount,
    markdownReport,
  };
}

function buildPrompt(
  code: string,
  language: string,
  filePath: string | undefined,
  context: string | undefined,
  dimKey: DimensionKey
): string {
  const fileRef = filePath ? `\nFile: \`${filePath}\`` : "";
  const ctxBlock = context ? `\n\n**Context:**\n${context}` : "";
  return `Review the following ${language} code.${fileRef}${ctxBlock}

\`\`\`${language.toLowerCase().split(" ")[0]}
${code}
\`\`\`

Return a JSON block:
\`\`\`json
{
  "score": <0-10>,
  "summary": "<2-3 sentence assessment>",
  "findings": [
    {
      "severity": "<CRITICAL|HIGH|MEDIUM|LOW|INFO>",
      "title": "<short title>",
      "description": "<what and why>",
      "line": <number or null>,
      "suggestion": "<concrete fix>",
      "cwe_id": "<CWE-NNN or null>"
    }
  ]
}
\`\`\``;
}
