/**
 * Diff Reviewer — generates review prompts for a git diff.
 * No API calls — prompts are designed to be sent to your IDE's built-in LLM.
 */

import type { ReviewDimension, DimensionReview } from "./types.js";

const DIMS: Record<
  string,
  { displayName: string; weight: number; systemPrompt: string }
> = {
  security: {
    displayName: "Security",
    weight: 0.2,
    systemPrompt:
      "You are a security reviewer. Focus ONLY on new/changed code in the diff. Check auth bypasses, XSS, injection, secrets, CORS, IDOR. Cite CWE IDs.",
  },
  vulnerabilities: {
    displayName: "Vulnerabilities",
    weight: 0.15,
    systemPrompt:
      "You are a vulnerability researcher. Focus ONLY on changed code. Check prototype pollution, ReDoS, SSRF, timing attacks, mass assignment.",
  },
  critical_blockers: {
    displayName: "Critical Blockers",
    weight: 0.2,
    systemPrompt:
      "Focus ONLY on changed code. Check for unimplemented critical paths, crash risks, data integrity issues, missing transactions.",
  },
  test_coverage: {
    displayName: "Test Coverage",
    weight: 0.15,
    systemPrompt:
      "Review the diff for missing tests covering the new/changed functionality. Check if changes include corresponding test updates.",
  },
  tech_debt: {
    displayName: "Tech Debt",
    weight: 0.1,
    systemPrompt:
      "Review the diff for TODOs, dead code, deprecated APIs, duplication introduced in these changes.",
  },
  complexity: {
    displayName: "Complexity",
    weight: 0.1,
    systemPrompt:
      "Review the diff for added complexity: cyclomatic complexity >10, functions >50 lines, deep nesting, boolean trap parameters.",
  },
  naming_conventions: {
    displayName: "Naming",
    weight: 0.1,
    systemPrompt:
      "Review the diff for naming issues in new/changed code: wrong case, vague names, inconsistency.",
  },
};

const JSON_FORMAT = `Return JSON:
\`\`\`json
{"score":<0-10>,"summary":"<assessment>","findings":[{"severity":"<CRITICAL|HIGH|MEDIUM|LOW>","title":"<title>","description":"<desc>","file_path":"<file or null>","line":<n|null>,"suggestion":"<fix>","cwe_id":"<CWE or null>"}]}
\`\`\`

Score the quality of the CHANGED code only.`;

export interface DiffPrompt {
  dimension: ReviewDimension;
  displayName: string;
  weight: number;
  systemPrompt: string;
  userPrompt: string;
}

/**
 * Generate review prompts for a git diff.
 * Paste each prompt into your IDE's chat (GitHub Copilot, Claude, etc.).
 */
export function buildDiffPrompts(
  diff: string,
  description: string,
  dimensions: ReviewDimension[]
): DiffPrompt[] {
  const diffForReview =
    diff.length > 50000
      ? diff.slice(0, 50000) + "\n\n... [diff truncated — too large] ..."
      : diff;

  return dimensions
    .filter((d) => DIMS[d])
    .map((dimKey) => {
      const meta = DIMS[dimKey];
      return {
        dimension: dimKey,
        displayName: meta.displayName,
        weight: meta.weight,
        systemPrompt: `${meta.systemPrompt}\n\n${JSON_FORMAT}`,
        userPrompt: `Review this git diff for ${meta.displayName} issues.\nContext: ${description}\n\n\`\`\`diff\n${diffForReview}\n\`\`\``,
      };
    });
}

export interface ReviewResult {
  dimensions: DimensionReview[];
  compositeScore: number;
  grade: string;
}

/**
 * Build a placeholder result structure for prompt-based review.
 * Actual scores come from the IDE's LLM response.
 */
export function buildPlaceholderResult(dimensions: ReviewDimension[]): ReviewResult {
  const dimResults: DimensionReview[] = dimensions
    .filter((d) => DIMS[d])
    .map((dimKey) => ({
      dimension: dimKey,
      displayName: DIMS[dimKey].displayName,
      score: 0,
      weight: DIMS[dimKey].weight,
      summary: "Pending IDE review",
      findings: [],
    }));

  return {
    dimensions: dimResults,
    compositeScore: 0,
    grade: "N/A",
  };
}

// Keep old signature for backwards compatibility with cli.ts but remove API dependency
export async function reviewDiff(
  diff: string,
  description: string,
  _apiKey: string,
  dimensions: ReviewDimension[],
  options: { onProgress?: (msg: string) => void } = {}
): Promise<ReviewResult> {
  options.onProgress?.("Generating prompts for IDE review...");
  const prompts = buildDiffPrompts(diff, description, dimensions);

  console.log(`\n${"=".repeat(80)}`);
  console.log(`Diff Review Prompts — ${description}`);
  console.log(`${"=".repeat(80)}\n`);
  console.log(`Copy each prompt into your IDE's chat (GitHub Copilot, Claude, etc.):\n`);

  for (const p of prompts) {
    console.log(`\n${"─".repeat(80)}`);
    console.log(`## ${p.displayName} (weight: ${(p.weight * 100).toFixed(0)}%)`);
    console.log(`${"─".repeat(80)}\n`);
    console.log(`**System:** ${p.systemPrompt}\n`);
    console.log(`**User prompt:**\n${p.userPrompt}`);
  }

  console.log(`\n${"=".repeat(80)}`);
  console.log(`TIP: Register the MCP server in your IDE for seamless review:`);
  console.log(`  @codeReviewBuddy /diff — reviews your last commit automatically`);
  console.log(`${"=".repeat(80)}\n`);

  return buildPlaceholderResult(dimensions);
}
