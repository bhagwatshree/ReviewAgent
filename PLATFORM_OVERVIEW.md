# Code Review Agent - Complete Platform

Three integration methods for AI-powered code review. Choose the one that fits your workflow.

---

## 🎯 Quick Overview

| Method | Use Case | Setup | Cost |
|--------|----------|-------|------|
| **Universal Agent** | Works with ANY IDE | CLI tool | FREE (uses IDE's LLM) |
| **MCP Server** | Always-on review service | Install for VS Code, Cursor, Claude Desktop | Anthropic API costs |
| **VSCode Extension** | Native VS Code integration | Install extension + API key | Anthropic API costs |

---

## 🚀 Option 1: Universal Code Review Agent

**For:** Developers using any IDE (VS Code, Cursor, IntelliJ, Vim, Sublime, etc.)

**No External API Calls** — Uses your IDE's built-in LLM

### Quick Start

```bash
cd universal-agent
npm install && npm run build

# Generate review prompts
node dist/cli.js --file src/auth.ts --format prompts

# Copy prompts → IDE chat → Get review
# (Works with Claude, Copilot, or any IDE LLM)
```

### Features

✅ Zero external API calls  
✅ Works with any IDE  
✅ Supports 8 review dimensions  
✅ Business logic validation (Jira, BRS, Architecture, Figma)  
✅ CLI + library API  

### Supported IDEs

- **VS Code** (with Claude extension or Copilot)
- **Cursor** (native chat)
- **IntelliJ / JetBrains** (AI Assistant plugin)
- **GitHub Copilot** (in any IDE)
- **Vim / Neovim** (with copilot.vim)
- **Any IDE** (CLI mode)

### Learn More

- [Universal Agent README](universal-agent/README.md)
- [IDE Integration Guide](universal-agent/IDE-INTEGRATION.md)
- [Architecture](universal-agent/ARCHITECTURE.md)

---

## 🔌 Option 2: MCP Server

**For:** Developers who want a review service integrated with MCP-compatible tools

**Works with:** VS Code (Claude extension), Cursor, IntelliJ (MCP plugin), Claude Desktop

### Setup

```bash
cd mcp-server
npm install && npm run build
```

Add to `.vscode/mcp.json` or `~/.mcp.json`:

```json
{
  "servers": {
    "code-review": {
      "type": "stdio",
      "command": "node",
      "args": ["/absolute/path/to/mcp-server/dist/index.js"],
      "env": {
        "ANTHROPIC_API_KEY": "${env:ANTHROPIC_API_KEY}"
      }
    }
  }
}
```

### Usage in Claude Chat

```
@code-review Use the review_file tool to analyze src/auth.ts
```

### Features

✅ 5 MCP tools for code review  
✅ Works in any MCP-compatible client  
✅ Streams results in real-time  
✅ Adaptive thinking for deeper analysis  
✅ Business logic reviews  

### Tools Provided

- `review_file` — Review a single file
- `review_directory` — Review all files in a directory
- `review_with_context` — Review with additional context
- `get_review_dimensions` — List all review criteria
- `batch_review` — Review multiple files

### Learn More

- [MCP Server README](mcp-server/README.md)

---

## 🎨 Option 3: VSCode Extension

**For:** VS Code users who want native integration

**Requires:** API key for Anthropic models

### Installation

```bash
cd vscode-extension
npm install
npm run build
npm run package
```

Install the `.vsix` file in VS Code or publish to marketplace.

### Usage

1. Right-click any file → "Review with AI"
2. Or use `@code-review` in VS Code chat
3. Get detailed review in seconds

### Features

✅ Native VS Code integration  
✅ Right-click context menu  
✅ Chat participant support  
✅ Real-time progress updates  
✅ Multi-file batch reviews  

### Learn More

- [VSCode Extension README](vscode-extension/README.md)

---

## 🧠 8 Review Dimensions

All three methods use the same 8 review criteria:

| Dimension | Weight | Checks |
|-----------|--------|--------|
| **Security** | 20% | Auth, XSS, injection, secrets, CORS |
| **Critical Blockers** | 20% | Production-readiness, data integrity, crashes |
| **Business Logic** | 20% | Requirements compliance, workflows, calculations |
| **Vulnerabilities** | 15% | Exploitable weaknesses, CVE patterns |
| **Test Coverage** | 15% | Unit tests, integration tests, edge cases |
| **Tech Debt** | 10% | Dead code, duplication, maintainability |
| **Complexity** | 10% | Cyclomatic complexity, deep nesting |
| **Naming** | 10% | Conventions, clarity, consistency |

---

## 📋 Business Logic Review

Review code against actual product requirements:

- **Jira Tickets** — Acceptance criteria implementation
- **BRS Documents** — Business requirements alignment
- **Architecture Diagrams** — Design adherence
- **Figma Designs** — UI/UX consistency

Place in `/docs/` folder, any format (JSON, Markdown, PDF text, images).

Learn more: [Business Logic Review](BUSINESS_LOGIC_REVIEW.md)

---

## 🔄 Workflow Comparison

### Universal Agent (Free, Any IDE)

```
Your Code → Generate Prompts → Copy to IDE Chat → IDE's LLM → Results
                                      ↓
                          (Manual copy/paste)
```

**Pros:** Free, works everywhere, no API keys  
**Cons:** Manual workflow, requires IDE chat access

### MCP Server (Always-on Service)

```
Your Code → Edit .mcp.json → MCP Server → Claude API → Results
           (Configure once)    ↓
                     (Automatic, in chat)
```

**Pros:** Seamless integration, always available, streaming  
**Cons:** Requires API key, API costs ($0.50-2.00 per file)

### VSCode Extension (Native)

```
Your Code → Right-click → Extension → Claude API → Results
                                 ↓
                        (Automatic, in panel)
```

**Pros:** Native UI, easy to use, one-click reviews  
**Cons:** VS Code only, requires API key, API costs

---

## 💰 Cost Analysis

| Method | Setup Cost | Per-Review Cost | Best For |
|--------|----------|-----------------|----------|
| **Universal Agent** | $0 | $0 (uses IDE LLM) | Budget-conscious teams |
| **MCP Server** | $0 | $0.50-2.00 (API calls) | Always-on reviews |
| **VSCode Extension** | $0 | $0.50-2.00 (API calls) | VS Code workflows |

---

## 🛠️ Project Structure

```
CodeReviewAgent/
├── universal-agent/          # CLI + library (works with ANY IDE)
│   ├── src/
│   │   ├── cli.ts           # Command-line interface
│   │   ├── types.ts         # TypeScript interfaces
│   │   ├── dimensions.ts    # Review criteria (8 dimensions)
│   │   ├── prompt-builder.ts # Generates prompts for LLM
│   │   ├── ide-providers.ts # VS Code, Cursor, IntelliJ
│   │   ├── review-engine.ts # Orchestrates reviews
│   │   └── index.ts         # Public API
│   ├── dist/                # Compiled JS
│   └── README.md
│
├── mcp-server/              # MCP integration (MCP clients)
│   ├── src/
│   │   ├── index.ts         # MCP server & tools
│   │   ├── reviewer.ts      # Core review logic
│   │   └── dimensions.ts    # Review criteria
│   └── README.md
│
├── vscode-extension/        # Native VS Code extension
│   ├── src/
│   │   ├── extension.ts     # VS Code extension lifecycle
│   │   ├── reviewer.ts      # Review implementation
│   │   └── ui/              # Chat participant UI
│   └── package.json
│
├── BUSINESS_LOGIC_REVIEW.md # Requirements validation guide
├── README.md                # Main overview
└── docs/                    # User requirement documents

```

---

## 🎓 Getting Started

### Choose Your Path

1. **I want to test it now (free)**
   → Start with [Universal Agent](universal-agent/README.md)
   
2. **I use VS Code with Claude extension**
   → Try [MCP Server](mcp-server/README.md)
   
3. **I want native VS Code integration**
   → Install [VSCode Extension](vscode-extension/README.md)

### Quick Commands

```bash
# Universal Agent (any IDE)
cd universal-agent && npm install && npm run build
node dist/cli.js --file src/app.ts --format prompts

# MCP Server (VS Code, Cursor, etc.)
cd mcp-server && npm install && npm run build
# Configure in .vscode/mcp.json

# VSCode Extension
cd vscode-extension && npm install && npm run build
code --install-extension ./code-review-*.vsix
```

---

## 📚 Documentation

- **[Universal Agent](universal-agent/README.md)** — Detailed usage guide
- **[IDE Integration](universal-agent/IDE-INTEGRATION.md)** — Step-by-step for each IDE
- **[Architecture](universal-agent/ARCHITECTURE.md)** — How it all works
- **[MCP Server](mcp-server/README.md)** — MCP integration details
- **[Business Logic Review](BUSINESS_LOGIC_REVIEW.md)** — Requirements validation
- **[VSCode Extension](vscode-extension/README.md)** — Extension development

---

## ❓ FAQ

**Q: Which should I choose?**  
A: Start with Universal Agent (free). If you like it, upgrade to MCP Server for convenience.

**Q: Do I need an API key?**  
A: Only for MCP Server and VSCode Extension (uses Anthropic API). Universal Agent uses your IDE's built-in LLM.

**Q: Can I use it with my team?**  
A: Yes! All methods work with team setups. MCP Server is best for consistent organization-wide reviews.

**Q: What's the latency?**  
A: Universal Agent is instant (just generates prompts). MCP/Extension depends on API response (~2-5 sec typical).

**Q: Can I customize review criteria?**  
A: Yes! Edit `dimensions.ts` to add custom review dimensions or modify existing ones.

---

## 🤝 Contributing

All components are designed to be extensible:
- Add custom IDE providers
- Create new review dimensions
- Extend business logic checks

See [Architecture](universal-agent/ARCHITECTURE.md) for extension points.

---

## 📄 License

ISC

---

## 🚀 What's Next?

- [Start with Universal Agent](universal-agent/README.md)
- [Review with Business Requirements](BUSINESS_LOGIC_REVIEW.md)
- [Integrate with Your IDE](universal-agent/IDE-INTEGRATION.md)
