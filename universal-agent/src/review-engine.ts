/**
 * Universal Code Review Engine
 * Orchestrates review across all dimensions using IDE's built-in LLM
 */

import type {
  CodeReviewRequest,
  DimensionReview,
  ReviewExecutionConfig,
  ReviewFinding,
} from "./types.js";
import { generateReviewPrompts } from "./prompt-builder.js";
import { getDimensionSpec } from "./dimensions.js";

/**
 * Parse LLM response into structured review
 */
function parseReviewResponse(
  text: string
): {
  score: number;
  summary: string;
  findings: ReviewFinding[];
} {
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
    const scoreMatch = text.match(/"score"\s*:\s*(\d+(?:\.\d+)?)/);
    return {
      score: scoreMatch ? parseFloat(scoreMatch[1]) : 5,
      summary: "Review completed",
      findings: [],
    };
  }
}

/**
 * Execute a complete code review using IDE's LLM
 */
export async function executeReview(
  request: CodeReviewRequest,
  config: ReviewExecutionConfig
): Promise<{
  dimensions: DimensionReview[];
  compositeScore: number;
  grade: string;
}> {
  // Generate all prompts upfront
  const promptResult = await generateReviewPrompts(request);
  const dimensions: DimensionReview[] = [];

  let totalScore = 0;
  let totalWeight = 0;

  for (const prompt of promptResult.prompts) {
    if (config.skipDimensions?.includes(prompt.dimension)) {
      continue;
    }

    if (config.verbose) {
      console.log(`\n📊 Reviewing: ${prompt.displayName}...`);
    }

    try {
      // Send to IDE's LLM
      const response = await Promise.race([
        config.provider.sendPromptToLLM(
          prompt.systemPrompt,
          prompt.userPrompt
        ),
        new Promise<string>((_, reject) =>
          setTimeout(
            () =>
              reject(new Error("Prompt timeout - IDE chat response took too long")),
            config.timeout || 30000
          )
        ),
      ]);

      const parsed = parseReviewResponse(response);
      const spec = getDimensionSpec(prompt.dimension);

      dimensions.push({
        dimension: prompt.dimension,
        displayName: prompt.displayName,
        score: parsed.score,
        weight: spec.weight,
        summary: parsed.summary,
        findings: parsed.findings,
      });

      totalScore += parsed.score * spec.weight;
      totalWeight += spec.weight;

      if (config.verbose) {
        console.log(
          `✅ ${prompt.displayName}: ${parsed.score.toFixed(1)}/10`
        );
      }
    } catch (error) {
      console.error(
        `❌ Error reviewing ${prompt.displayName}:`,
        error instanceof Error ? error.message : String(error)
      );
      throw error;
    }
  }

  const compositeScore =
    totalWeight > 0 ? totalScore / totalWeight : 5;
  const grade = scoreToGrade(compositeScore);

  return { dimensions, compositeScore, grade };
}

/**
 * Convert score to letter grade
 */
function scoreToGrade(score: number | undefined): string {
  const s = score ?? 0;
  if (s >= 9.0) return "A+";
  if (s >= 8.0) return "A";
  if (s >= 7.0) return "B";
  if (s >= 6.0) return "C";
  if (s >= 5.0) return "D";
  return "F";
}

/**
 * Format review results as markdown
 */
export function formatReviewMarkdown(
  request: CodeReviewRequest,
  result: {
    dimensions: DimensionReview[];
    compositeScore: number;
    grade: string;
  }
): string {
  const bar = (score: number) => {
    const filled = Math.round(score);
    return `[${"#".repeat(filled)}${"·".repeat(10 - filled)}] ${score.toFixed(1)}/10`;
  };

  const icon = (s: string) =>
    ({
      CRITICAL: "🔴",
      HIGH: "🟠",
      MEDIUM: "🟡",
      LOW: "🔵",
      INFO: "⚪",
    }[s] ?? "⚪");

  const target = request.filePath ? `\`${request.filePath}\`` : "selected code";

  let md = `# Code Review Report\n\n`;
  md += `**Target:** ${target}\n`;
  md += `**Language:** ${request.language || "Auto-detected"}\n`;
  md += `**Overall Score:** ${result.compositeScore.toFixed(1)}/10 (Grade **${result.grade}**)\n\n`;
  md += `\`\`\`\nOverall  ${bar(result.compositeScore)}\n\`\`\`\n\n`;

  md += `## Dimension Scores\n\n`;
  md += `| Dimension | Score | Weight | Status |\n`;
  md += `|-----------|-------|--------|--------|\n`;

  for (const r of result.dimensions) {
    const status = r.score >= 7 ? "✅" : r.score >= 4 ? "⚠️" : "❌";
    md += `| ${r.displayName} | ${r.score.toFixed(1)}/10 | ${(r.weight * 100).toFixed(0)}% | ${status} |\n`;
  }

  const criticalFindings = result.dimensions
    .flatMap((r) =>
      r.findings
        .filter((f) => f.severity === "CRITICAL")
        .map((f) => ({ ...f, dimension: r.displayName }))
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
  for (const r of result.dimensions) {
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

/**
 * Format review results as JSON
 */
export function formatReviewJSON(
  request: CodeReviewRequest,
  result: {
    dimensions: DimensionReview[];
    compositeScore: number;
    grade: string;
  }
): string {
  return JSON.stringify(
    {
      metadata: {
        filePath: request.filePath,
        language: request.language,
        timestamp: new Date().toISOString(),
      },
      score: {
        composite: result.compositeScore,
        grade: result.grade,
      },
      dimensions: result.dimensions.map((d) => ({
        name: d.dimension,
        displayName: d.displayName,
        score: d.score,
        weight: d.weight,
        summary: d.summary,
        findings: d.findings,
      })),
    },
    null,
    2
  );
}
