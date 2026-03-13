/**
 * Prompt Builder - generates review prompts for any LLM
 * Formats code and context for the IDE's built-in chat
 */

import { readFile } from "fs/promises";
import { resolve, join, dirname, extname } from "path";
import type {
  ReviewDimension,
  CodeReviewRequest,
  ReviewPrompt,
  PromptGenerationResult,
} from "./types.js";
import { getDimensionSpec, ALL_DIMENSIONS } from "./dimensions.js";

/**
 * Detect programming language from file extension or code content
 */
export function detectLanguage(code: string, filePath?: string): string {
  if (filePath) {
    const ext = filePath.split(".").pop()?.toLowerCase();
    const extMap: Record<string, string> = {
      ts: "TypeScript",
      tsx: "TypeScript (React)",
      js: "JavaScript",
      jsx: "JavaScript (React)",
      py: "Python",
      java: "Java",
      kt: "Kotlin",
      go: "Go",
      rb: "Ruby",
      cs: "C#",
      php: "PHP",
      swift: "Swift",
      rs: "Rust",
      cpp: "C++",
      c: "C",
      sql: "SQL",
      sh: "Shell",
      yaml: "YAML",
      yml: "YAML",
    };
    if (ext && extMap[ext]) return extMap[ext];
  }

  if (code.includes("import React") || code.includes("jsx"))
    return "TypeScript (React)";
  if (code.includes("def ") && code.includes(":")) return "Python";
  if (code.includes("func ") && code.includes("package ")) return "Go";
  if (code.includes("public class ")) return "Java";
  return "TypeScript";
}

/**
 * Load a document from disk (JSON, markdown, PDF text, images)
 */
async function loadDocument(
  docPath: string,
  projectRoot: string
): Promise<string | null> {
  if (!docPath) return null;

  try {
    const fullPath = resolve(projectRoot, docPath);
    const content = await readFile(fullPath, "utf-8");
    const ext = extname(fullPath).toLowerCase();

    if (ext === ".json") {
      try {
        const parsed = JSON.parse(content);
        return JSON.stringify(parsed, null, 2);
      } catch {
        return content;
      }
    } else if ([".pdf", ".txt", ".md", ".markdown"].includes(ext)) {
      return content;
    } else if (
      [".png", ".jpg", ".jpeg", ".gif", ".webp"].includes(ext)
    ) {
      return `[Image: ${docPath}]\n(Refer to design documents in /docs/ for visual specs)`;
    } else {
      return content;
    }
  } catch {
    return null;
  }
}

/**
 * Build business context from requirement documents
 */
async function buildBusinessContext(
  businessContext: CodeReviewRequest["businessContext"],
  projectRoot: string
): Promise<string> {
  if (!businessContext) return "";

  const contextParts: string[] = [];
  const docs = {
    Jira: businessContext.jiraPath,
    "BRS (Business Specification)": businessContext.brsPath,
    Architecture: businessContext.architecturePath,
    "Figma Design": businessContext.figmaPath,
  };

  for (const [label, docPath] of Object.entries(docs)) {
    if (!docPath) continue;

    const searchPath = docPath.startsWith("docs/")
      ? docPath
      : join("docs", docPath);

    const content = await loadDocument(searchPath, projectRoot);
    if (content) {
      const maxLen = 8000;
      const truncated =
        content.length > maxLen
          ? content.substring(0, maxLen) + "\n... [truncated] ..."
          : content;
      contextParts.push(`## ${label}\n${truncated}`);
    }
  }

  return contextParts.length > 0
    ? `\n\n**Business Requirements & Design Context:**\n\n${contextParts.join("\n\n---\n\n")}`
    : "";
}

/**
 * Build user message for a review dimension
 */
function buildUserMessage(
  code: string,
  language: string,
  filePath: string | undefined,
  additionalContext: string | undefined,
  businessContextStr: string,
  dimension: ReviewDimension
): string {
  const fileRef = filePath ? `\nFile: \`${filePath}\`` : "";
  const additionalBlock = additionalContext
    ? `\n\n**Additional Context:**\n${additionalContext}`
    : "";
  const businessBlock = businessContextStr;
  const dimensionName = getDimensionSpec(dimension).displayName;

  return `Review the following ${language} code for **${dimensionName}** issues.${fileRef}${additionalBlock}${businessBlock}

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

/**
 * Generate review prompts for all dimensions
 * Ready to send to IDE's LLM
 */
export async function generateReviewPrompts(
  request: CodeReviewRequest
): Promise<PromptGenerationResult> {
  const projectRoot = request.filePath
    ? dirname(request.filePath)
    : process.cwd();
  const language = request.language || detectLanguage(request.code, request.filePath);
  const dimensions = request.dimensions || ALL_DIMENSIONS;

  // Build business context once (shared for business_logic dimension)
  const businessContextStr = await buildBusinessContext(
    request.businessContext,
    projectRoot
  );

  const prompts: ReviewPrompt[] = [];
  let totalContextSize = 0;

  for (const dimension of dimensions) {
    const spec = getDimensionSpec(dimension);

    // Only include business context for business_logic dimension
    const contextForMessage =
      dimension === "business_logic" ? businessContextStr : "";

    const userPrompt = buildUserMessage(
      request.code,
      language,
      request.filePath,
      request.additionalContext,
      contextForMessage,
      dimension
    );

    prompts.push({
      dimension,
      displayName: spec.displayName,
      systemPrompt: spec.systemPrompt,
      userPrompt,
      weight: spec.weight,
    });

    totalContextSize += spec.systemPrompt.length + userPrompt.length;
  }

  return {
    prompts,
    metadata: {
      fileName: request.filePath,
      language,
      documentCount: businessContextStr.length > 0 ? 1 : 0,
      totalContextSize,
    },
  };
}

/**
 * Format a single prompt for display to IDE user
 * (e.g., for manual copy-paste into IDE chat)
 */
export function formatPromptForManualEntry(
  prompt: ReviewPrompt
): string {
  return `
=== Code Review Prompt: ${prompt.displayName} ===
Weight: ${(prompt.weight * 100).toFixed(0)}%

SYSTEM PROMPT:
${prompt.systemPrompt}

USER PROMPT:
${prompt.userPrompt}

---
Paste the USER PROMPT into your IDE's chat, and set the context/system message to the SYSTEM PROMPT above.
`;
}
