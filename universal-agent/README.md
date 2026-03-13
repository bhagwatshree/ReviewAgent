# Universal Code Review Agent

**IDE-agnostic code review agent that works with any IDE's built-in LLM — no external API calls.**

Stop paying for API calls. Use the LLM already built into your IDE (VS Code, Cursor, IntelliJ, etc.) to review your code.

## Features

✅ **Zero External API Calls** — Uses your IDE's built-in LLM (Claude, GPT, etc.)  
✅ **IDE-Agnostic** — Works with VS Code, Cursor, IntelliJ, and any IDE with chat  
✅ **8 Review Dimensions** — Security, vulnerabilities, blockers, tests, debt, complexity, naming, business logic  
✅ **Business Requirements** — Validates code against Jira, BRS, architecture docs, Figma designs  
✅ **CLI + Library** — Use as command-line tool or integrate into your IDE extension  
✅ **No Auth Required** — Leverage your existing IDE setup, no API keys needed  

---

## Quick Start

### 1. Install

```bash
cd universal-agent
npm install
npm run build
```

### 2. Generate Review Prompts

```bash
node dist/cli.js --file src/auth.ts --format prompts
```

Output will show prompts to copy into your IDE's chat.

### 3. Use with Your IDE

**VS Code (with Claude extension):**
```
1. Ctrl+Shift+I (or Cmd+Shift+I)
2. Copy the SYSTEM PROMPT to the context instruction
3. Paste the USER PROMPT into the chat
4. Get review from Claude's built-in chat
```

**Cursor:**
```
1. Ctrl+K (or Cmd+K) to open chat
2. Paste the prompt
3. Get review instantly
```

**IntelliJ:**
```
1. Open AI Assistant (Tools > AI Assistant or Alt+\)
2. Paste the prompt
3. Get review from built-in AI
```

---

## Usage

### CLI Mode - Manual IDE Entry

Generate prompts to manually copy into your IDE:

```bash
# Basic review
code-review-agent --file src/payment.ts --format prompts

# With business requirements
code-review-agent --file src/checkout.ts \
  --jira docs/JIRA-456.json \
  --brs docs/requirements.md \
  --format prompts

# Output as JSON for parsing
code-review-agent --file src/api.ts --format json
```

### Programmatic API (for IDE extensions)

```typescript
import {
  generateReviewPrompts,
  formatReviewMarkdown,
  executeReview,
} from "code-review-universal-agent";

// 1. Generate prompts
const code = await fs.readFile("src/auth.ts", "utf-8");
const prompts = await generateReviewPrompts({
  code,
  filePath: "src/auth.ts",
  businessContext: {
    jiraPath: "docs/JIRA-789.json",
    brsPath: "docs/requirements.md",
  },
});

// 2. Send each prompt to IDE's LLM
for (const prompt of prompts.prompts) {
  // Send to your IDE's chat API
  const response = await yourIDEChat(
    prompt.systemPrompt,
    prompt.userPrompt
  );

  // 3. Parse and format results
  const markdown = formatReviewMarkdown({code, filePath: "src/auth.ts"}, response);
  console.log(markdown);
}
```

---

## Supported IDEs

| IDE | Status | How to Use |
|-----|--------|-----------|
| **VS Code** (Claude/Copilot) | ✅ Supported | Open chat, paste prompt |
| **Cursor** | ✅ Supported | Ctrl+K, paste prompt |
| **IntelliJ / JetBrains** | ✅ Supported | AI Assistant, paste |
| **Vim / Neovim** | ✅ Supported | With copilot.vim or AI plugin |
| **Sublime** | ✅ Supported | With Codeium or similar |
| **Any IDE** | ✅ Supported | CLI + manual chat entry |

---

## Document Support

Place requirement documents in `/docs/` folder. Supported formats:

| Format | Extension | Example |
|--------|-----------|---------|
| Markdown | `.md` | `docs/requirements.md` |
| JSON | `.json` | `docs/jira-ticket.json` |
| PDF (text) | `.txt` | `docs/spec.txt` |
| Figma Export | `.json` | `docs/design-export.json` |
| Images | `.png`, `.jpg` | `docs/architecture.png` |

---

## Review Dimensions

All 8 dimensions are evaluated:

| Dimension | Weight | Focus |
|-----------|--------|-------|
| Security | 20% | Auth, XSS, injection, secrets |
| Critical Blockers | 20% | Production-readiness |
| Business Logic | 20% | Requirements compliance |
| Vulnerabilities | 15% | Exploitable weaknesses |
| Test Coverage | 15% | Unit/integration tests |
| Tech Debt | 10% | Maintainability |
| Complexity | 10% | Cyclomatic complexity |
| Naming | 10% | Conventions & clarity |

---

## Example: Complete Review Flow

```bash
# 1. Generate prompts
code-review-agent \
  --file src/checkout.ts \
  --jira docs/JIRA-LOGIN.json \
  --brs docs/userauth-spec.md \
  --architecture docs/system-design.md \
  --format prompts > review-prompts.txt

# 2. Open in your IDE and copy prompts one by one
# VS Code: Ctrl+Shift+I, paste SYSTEM PROMPT in context, then USER PROMPT

# 3. Copy LLM response to a file
# response.json

# 4. Parse the results
code-review-agent \
  --file src/checkout.ts \
  --format json \
  < response.json > final-review.json
```

---

## Comparison: MCP Server vs Universal Agent

| Aspect | MCP Server | Universal Agent |
|--------|-----------|-----------------|
| API Cost | Yes (Anthropic API) | No (IDE LLM only) |
| IDE Integration | Built-in for MCP clients | Works with any IDE |
| ML Model | Claude only | Any IDE LLM |
| Architecture | Daemon server | CLI tool + library |
| Best For | Always-on review service | On-demand reviews |

---

## Architecture

```
┌─────────────────────────────────────┐
│ Your IDE (VS Code, Cursor, etc.)    │
│ • Built-in Chat Interface           │
│ • Claude / GPT / Other LLM          │
└──────────────┬──────────────────────┘
               │ (Built-in LLM, no API calls)
               │
┌──────────────▼──────────────────────┐
│ Universal Code Review Agent         │
│ • Prompt Generator                  │
│ • Dimension Orchestrator            │
│ • Result Formatter                  │
│ • IDE Providers (VSCode, Cursor)    │
└─────────────────────────────────────┘
               ▲
               │
       CLI / Extension API
```

---

## Development

```bash
cd universal-agent

# Build
npm run build

# Watch
npm run dev

# Test
npm test

# Run CLI
node dist/cli.js --help
```

---

## License

ISC
