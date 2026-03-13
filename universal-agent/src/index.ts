/**
 * Universal Code Review Agent - Public API
 * Use this to integrate code review into any IDE or tool
 */

// Core types
export type { CodeReviewRequest, ReviewFinding, ReviewPrompt, ReviewExecutionConfig, IDEProvider, ReviewDimension } from "./types.js";

// Public functions
export { generateReviewPrompts, detectLanguage, formatPromptForManualEntry } from "./prompt-builder.js";
export { executeReview, formatReviewMarkdown, formatReviewJSON } from "./review-engine.js";

// HTML Report Generator
export { generateHTMLReport, saveHTMLReport, parsePromptFile, generateHTMLFromResult, saveHTMLFromResult } from "./html-reporter.js";

// IDE providers
export { VSCodeProvider, CursorProvider, JetBrainsProvider, CLIProvider, detectProvider, getProvider } from "./ide-providers.js";

// Dimensions
export { DIMENSION_SPECS, ALL_DIMENSIONS, getDimensionSpec } from "./dimensions.js";

// Diff fetching
export { parseDiffArgs, fetchDiff, fetchLocalGitDiff, fetchLocalVsRemoteDiff, fetchGitHubDiff, fetchGitLabDiff } from "./diff-fetcher.js";
export type { DiffArgs, DiffResult, DiffType } from "./diff-fetcher.js";

// Diff review (direct Anthropic API)
export { reviewDiff } from "./diff-reviewer.js";

// Project review (direct Anthropic API with agentic file tools)
export { reviewProject, collectSourceFiles, detectStack } from "./project-reviewer.js";
export type { ProjectReviewResult } from "./project-reviewer.js";
