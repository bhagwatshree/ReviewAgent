/**
 * Universal Code Review Agent Types
 * Works with any IDE's built-in LLM (no external API calls)
 */

export type ReviewDimension =
  | "security"
  | "vulnerabilities"
  | "critical_blockers"
  | "test_coverage"
  | "tech_debt"
  | "complexity"
  | "naming_conventions"
  | "business_logic";

export interface ReviewFinding {
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";
  title: string;
  description: string;
  line?: number;
  suggestion: string;
  cwe_id?: string;
}

export interface DimensionReview {
  dimension: ReviewDimension;
  displayName: string;
  score: number;
  weight: number;
  summary: string;
  findings: ReviewFinding[];
}

export interface CodeReviewRequest {
  code: string;
  filePath?: string;
  language?: string;
  dimensions?: ReviewDimension[];
  businessContext?: {
    jiraPath?: string;
    brsPath?: string;
    architecturePath?: string;
    figmaPath?: string;
    docsRoot?: string;
  };
  additionalContext?: string;
}

export interface ReviewPrompt {
  dimension: ReviewDimension;
  displayName: string;
  systemPrompt: string;
  userPrompt: string;
  weight: number;
}

export interface PromptGenerationResult {
  prompts: ReviewPrompt[];
  metadata: {
    fileName?: string;
    language?: string;
    documentCount: number;
    totalContextSize: number;
  };
}

/**
 * IDE Provider Interface - implements for VS Code, Cursor, IntelliJ, etc.
 */
export interface IDEProvider {
  name: string;
  /**
   * Send a prompt to the IDE's built-in LLM and get a response
   * The IDE provider handles the chat UI and model selection
   */
  sendPromptToLLM(systemPrompt: string, userPrompt: string): Promise<string>;

  /**
   * Check if this provider is available in the current IDE
   */
  isAvailable(): boolean;
}

/**
 * Configuration for review execution
 */
export interface ReviewExecutionConfig {
  provider: IDEProvider;
  outputFormat?: "json" | "markdown" | "console";
  verbose?: boolean;
  skipDimensions?: ReviewDimension[];
  timeout?: number; // milliseconds per prompt
}
