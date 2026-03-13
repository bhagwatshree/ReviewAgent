# Architecture - Universal Code Review Agent

## Overview

The Universal Code Review Agent is designed to work with **any IDE's built-in LLM** without external API calls. It generates structured review prompts that can be sent to an IDE's chat interface.

```
┌──────────────────────────────────┐
│   IDE Chat Interface             │
│   (VS Code, Cursor, IntelliJ)    │
│   Built-in LLM (Claude, Copilot) │
└───────────────┬──────────────────┘
                │
                │ (manualcopy/paste)
                │
┌───────────────▼──────────────────┐
│  Prompt Generation               │
│  • DimensionGenerator            │
│  • PromptBuilder                 │
│  • DocumentLoader                │
└───────────────┬──────────────────┘
                │
┌───────────────▼──────────────────┐
│  Review Orchestration            │
│  • ReviewEngine                  │
│  • ResponseParser                │
│  • ResultFormatter               │
└───────────────┬──────────────────┘
                │
┌───────────────▼──────────────────┐
│  CLI Interface                   │
│  • ArgumentParser                │
│  • FileReader                    │
│  • OutputFormatter               │
└──────────────────────────────────┘
```

---

## Core Components

### 1. **Prompt Builder** (`src/prompt-builder.ts`)

Generates review prompts from code and requirements.

**Key Functions:**
- `generateReviewPrompts()` — Creates prompts for all dimensions
- `detectLanguage()` — Identifies programming language
- `loadDocument()` — Reads requirement docs (JSON, Markdown, images)
- `buildBusinessContext()` — Combines requirement docs into context

**Input:** Code file + optional requirement documents
**Output:** Array of `ReviewPrompt` objects (system + user prompts)

### 2. **Dimension Specifications** (`src/dimensions.ts`)

Defines review criteria for all 8 dimensions.

Each dimension has:
- **displayName** — Human-readable name
- **weight** — Importance in composite score (0-1)
- **systemPrompt** — Instructions for the LLM (e.g., "You are a security expert...")

**Dimensions:**
1. Security (20%)
2. Vulnerabilities (15%)
3. Critical Blockers (20%)
4. Test Coverage (15%)
5. Tech Debt (10%)
6. Complexity (10%)
7. Naming Conventions (10%)
8. Business Logic (20%)

### 3. **Review Engine** (`src/review-engine.ts`)

Orchestrates the review process and formats results.

**Key Functions:**
- `executeReview()` — Runs review across all dimensions
- `parseReviewResponse()` — Parses LLM JSON responses
- `formatReviewMarkdown()` — Generates markdown report
- `formatReviewJSON()` — Generates JSON output

### 4. **IDE Providers** (`src/ide-providers.ts`)

Abstraction for different IDE chat APIs.

**Providers:**
- `VSCodeProvider` — VS Code Chat API
- `CursorProvider` — Cursor IDE native chat
- `JetBrainsProvider` — IntelliJ/JetBrains AI Assistant
- `CLIProvider` — CLI mode (print prompts for manual entry)

Each provider implements `IDEProvider`:
```typescript
interface IDEProvider {
  name: string;
  sendPromptToLLM(systemPrompt: string, userPrompt: string): Promise<string>;
  isAvailable(): boolean;
}
```

### 5. **CLI Interface** (`src/cli.ts`)

Command-line interface for manual prompt generation and response processing.

**Usage:**
```bash
code-review-agent --file src/app.ts --format prompts
code-review-agent --file src/api.ts --format json
```

---

## Data Flow

### Scenario: User reviews `src/auth.ts`

```
┌─ CLI Entry Point
│  cli --file src/auth.ts --format prompts
│
├─ generateReviewPrompts(request)
│  ├─ readFile("src/auth.ts")
│  ├─ detectLanguage("typescript")
│  ├─ loadDocument("docs/JIRA-789.json")
│  ├─ buildBusinessContext(docs)
│  └─ Generate 8 prompts (one per dimension)
│
├─ For each prompt:
│  ├─ System: "You are a security expert..."
│  └─ User: "Review this TypeScript code for security issues: ```typescript ... ```"
│
├─ Output to CLI:
│  ├─ "=== Code Review Prompt: Security ===" 
│  ├─ SYSTEM PROMPT: [...]
│  └─ USER PROMPT: [...]
│
└─ User copies prompts → pastes into IDE chat → LLM responds
```

---

## Prompt Structure

Each prompt is designed for an LLM to:
1. Understand the review dimension
2. Analyze code with specific criteria
3. Return structured JSON response

### Example: Security Prompt

**SYSTEM:**
```
You are a security-focused code reviewer specializing in application security.

SECURITY REVIEW SCOPE:
- Authentication stubs, bypasses, or missing auth guards
- CORS misconfigurations ...
- XSS vectors ...
[... criteria ...]

For each issue cite the CWE ID. Score 10 if no security issues, 0 if critical auth bypass exists.
```

**USER:**
```
Review the following TypeScript code for **Security** issues.
File: `src/auth.ts`

```typescript
// code here
```

Return your review as a JSON block:
```json
{
  "score": <0-10 integer>,
  "summary": "<assessment>",
  "findings": [
    {
      "severity": "<CRITICAL|HIGH|MEDIUM|LOW|INFO>",
      "title": "<title>",
      "description": "<description>",
      "line": <number or null>,
      "suggestion": "<fix>",
      "cwe_id": "<CWE-NNN or null>"
    }
  ]
}
```
```

**LLM Response:**
```json
{
  "score": 6,
  "summary": "Code has basic auth checks but hardcoded API key is a critical issue.",
  "findings": [
    {
      "severity": "CRITICAL",
      "title": "Hardcoded API Key",
      "description": "API key exposed in source code at line 42",
      "line": 42,
      "suggestion": "Use environment variables: const key = process.env.API_KEY;",
      "cwe_id": "CWE-798"
    }
  ]
}
```

---

## Business Logic Review Integration

When a file has a corresponding Jira/BRS/Architecture document:

```
generateReviewPrompts({
  code: "...",
  filePath: "src/checkout.ts",
  businessContext: {
    jiraPath: "docs/JIRA-LOGIN.json",
    brsPath: "docs/requirements.md",
    architecturePath: "docs/arch.md"
  }
})

↓

For dimension === "business_logic":
  → Include all 3 documents in the user prompt
  → Model checks code against actual requirements
  → Catches: missing features, logic errors, workflow violations
```

---

## Response Parsing

LLM returns JSON, we parse it:

```typescript
function parseReviewResponse(text: string) {
  // Extract JSON from markdown code block
  const jsonMatch = text.match(/```json\s*([\s\S]*?)```/);
  const rawJson = jsonMatch ? jsonMatch[1] : text;
  
  // Parse and normalize
  const parsed = JSON.parse(rawJson);
  return {
    score: Math.min(10, Math.max(0, parsed.score)),
    summary: parsed.summary,
    findings: parsed.findings.map(f => ({
      severity: f.severity || "INFO",
      title: f.title,
      description: f.description,
      line: f.line,
      suggestion: f.suggestion,
      cwe_id: f.cwe_id
    }))
  };
}
```

---

## Output Formats

### Format: `prompts`
```
=== Code Review Prompt: Security ===
Weight: 20%

SYSTEM PROMPT:
[... system prompt ...]

USER PROMPT:
[... user prompt ...]

---

=== Code Review Prompt: Vulnerabilities ===
...
```

User copies these prompts into their IDE chat.

### Format: `markdown`
```
# Code Review Report

**Target:** `src/auth.ts`
**Language:** TypeScript
**Overall Score:** 6.5/10 (Grade **C**)

## Dimension Scores

| Dimension | Score | Weight | Status |
|-----------|-------|--------|--------|
| Security | 6.0/10 | 20% | ⚠️ |
| Vulnerabilities | 7.0/10 | 15% | ✅ |
...
```

### Format: `json`
```json
{
  "metadata": {
    "filePath": "src/auth.ts",
    "language": "TypeScript",
    "timestamp": "2026-03-12T10:30:00Z"
  },
  "score": {
    "composite": 6.5,
    "grade": "C"
  },
  "dimensions": [...]
}
```

---

## IDE Integration Points

| IDE | Integration | Status |
|-----|-----------|--------|
| VS Code | Chat API, extensions | ✅ Supported |
| Cursor | Native chat | ✅ Supported |
| IntelliJ | AI Assistant plugin | ✅ Supported |
| GitHub Copilot | Chat in any IDE | ✅ Supported |
| CLI | Print prompts | ✅ Supported |
| Custom IDE | Implement `IDEProvider` | ✅ Extensible |

---

## Performance Characteristics

- **Prompt Generation:** < 100ms (excluding file I/O)
- **Single Review:** 8 prompts × (LLM response time)
  - Typical: 2-5 seconds per dimension with modern LLM
  - Total: ~15-40 seconds per file
- **Memory:** < 50MB for typical code files
- **Document Loading:** < 500ms for 8KB docs

---

## Security & Privacy

✅ **No API calls** — All processing local to IDE  
✅ **No data transmission** — Docs stay on your machine  
✅ **IDE-native LLM** — Uses your existing Copilot/Claude setup  
✅ **No account required** — Works with local IDE credentials  

---

## Extension Points

### Add Custom Dimension

```typescript
// In dimensions.ts
export const DIMENSION_SPECS: Record<ReviewDimension, DimensionSpec> = {
  ...
  performance: {
    name: "performance",
    displayName: "Performance",
    weight: 0.10,
    systemPrompt: "You are a performance expert..."
  }
};
```

### Add Custom IDE Provider

```typescript
export class MyIDEProvider implements IDEProvider {
  name = "my-ide";
  
  isAvailable(): boolean {
    return process.env.MY_IDE_HOME !== undefined;
  }
  
  async sendPromptToLLM(systemPrompt, userPrompt) {
    // Your IDE's chat API
  }
}
```

---

## See Also

- [README](README.md)
- [IDE Integration Guide](IDE-INTEGRATION.md)
- [CLI Reference](README.md#usage)
