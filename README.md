# Code Review Agent - Complete Platform

**AI-powered code review for any IDE** — Choose your integration method:

| Method | Best For | API Cost | Works In |
|--------|----------|----------|----------|
| **🆕 Universal Agent** | Start here (FREE) | None | Any IDE |
| **MCP Server** | Always-on service | Anthropic API | VS Code, Cursor, IntelliJ, Claude Desktop |
| **VSCode Extension** | Native VS Code | Anthropic API | VS Code only |

---

## ⚡ Quick Start (5 Minutes)

### Universal Agent — FREE, Works Everywhere

Zero API calls. Uses your IDE's built-in LLM (Claude, Copilot, etc.)

```bash
cd universal-agent
npm install && npm run build

# Generate review prompts
node dist/cli.js --file src/auth.ts --format prompts

# Copy prompts → Paste into IDE chat → Get review
```

**Works with:** VS Code, Cursor, IntelliJ, Vim, Copilot, any IDE with chat

👉 [Get Started with Universal Agent](universal-agent/QUICKSTART.md)

---

## 🔧 Integration Options

### Option 1 — Universal Agent (Recommended - FREE)

**Works with ANY IDE** using your built-in LLM (no API calls)

```bash
cd universal-agent
npm install && npm run build
node dist/cli.js --file src/auth.ts --format prompts
```

- ✅ Zero cost (uses IDE's LLM)
- ✅ Works with any IDE (VS Code, Cursor, IntelliJ, Vim, etc.)
- ✅ Manual but simple: copy prompt → paste in IDE → get review
- ✅ Full business logic review support

📚 [Universal Agent Docs](universal-agent/README.md) | [IDE Setup Guide](universal-agent/IDE-INTEGRATION.md) | [Quick Start](universal-agent/QUICKSTART.md)

---

### Option 2 — MCP Server (Always-On Service)

**For:** VS Code, Cursor, Claude Desktop, JetBrains IDEs  
**Requires:** Anthropic API key  
**Cost:** API charges per review

Seamless integration as an MCP server. Set up once, review automatically.

```bash
cd mcp-server
npm install && npm run build

# Configure in .vscode/mcp.json or ~/.cursor/mcp.json
```

Works with:
- ✅ VS Code (Claude extension / Copilot)
- ✅ Cursor IDE
- ✅ Claude Desktop
- ✅ JetBrains IDEs (IntelliJ, WebStorm, etc.)

📚 [MCP Server Docs](mcp-server/README.md)

---

### Option 3 — VSCode Extension (Native)

**For:** VS Code users only  
**Requires:** Anthropic API key  
**Cost:** API charges per review

Native VS Code integration with chat participant and right-click commands.

```bash
cd vscode-extension
npm install && npm run build

# Install the .vsix file
```

- ✅ Right-click "Review with AI"
- ✅ Native VS Code Chat Participant
- ✅ Batch review support

📚 [VSCode Extension Docs](vscode-extension/README.md)

---

## 8 Review Dimensions

All three integration methods use the same comprehensive review criteria:

| Dimension | Weight | Focus |
|-----------|--------|-------|
| **Security** | 20% | Auth, XSS, injection, CORS, secrets, IDOR |
| **Critical Blockers** | 20% | Production-readiness, data integrity, crashes |
| **Business Logic** | 20% | Requirements compliance, workflows, calculations |
| **Vulnerabilities** | 15% | CVE patterns, ReDoS, SSRF, race conditions |
| **Test Coverage** | 15% | Unit tests, integration tests, edge cases |
| **Tech Debt** | 10% | Dead code, duplication, maintainability |
| **Complexity** | 10% | Cyclomatic complexity, deep nesting |
| **Naming** | 10% | Conventions, clarity, consistency |

---

## Business Logic Review

Validate code against **actual product requirements**:

- **Jira Tickets** — Implement all acceptance criteria
- **BRS Documents** — Match business specifications
- **Architecture Diagrams** — Follow design decisions
- **Figma Designs** — Align with UI/UX specs

Place requirement docs in `/docs/` folder (any format: JSON, Markdown, PDF text, images).

📚 [Business Logic Review Guide](BUSINESS_LOGIC_REVIEW.md)

---

## 📂 Project Structure

```
CodeReviewAgent/
├── universal-agent/         # CLI + library (works with ANY IDE)
│   ├── src/                 # 7 TypeScript modules
│   ├── dist/                # Compiled JavaScript + types
│   ├── QUICKSTART.md
│   ├── README.md
│   ├── IDE-INTEGRATION.md   # VS Code, Cursor, IntelliJ setup
│   └── ARCHITECTURE.md      # Technical details
│
├── mcp-server/              # MCP Server for Claude, Copilot
│   ├── src/
│   │   ├── index.ts         # MCP server + 5 tools
│   │   ├── reviewer.ts      # Claude API integration
│   │   └── dimensions.ts    # Review dimensions
│   └── README.md
│
├── vscode-extension/        # Native VSCode extension
│   ├── src/
│   │   ├── extension.ts
│   │   └── reviewer.ts
│   └── README.md
│
├── PLATFORM_OVERVIEW.md     # Compare all 3 methods
├── BUSINESS_LOGIC_REVIEW.md # Requirements validation
└── docs/                    # Custom requirement documents (JSON, Markdown, etc.)
```

---

## 📚 Documentation

### Getting Started
- **[Platform Overview](PLATFORM_OVERVIEW.md)** — Compare all 3 integration methods
- **[Universal Agent Quick Start](universal-agent/QUICKSTART.md)** — 5-minute setup (recommended first step)
- **[Universal Agent Full README](universal-agent/README.md)** — Complete documentation

### IDE Integration
- **[IDE Setup Guide](universal-agent/IDE-INTEGRATION.md)** — Step-by-step for VS Code, Cursor, IntelliJ, Vim
- **[MCP Server README](mcp-server/README.md)** — MCP integration details
- **[VSCode Extension README](vscode-extension/README.md)** — Native extension

### Technical
- **[Universal Agent Architecture](universal-agent/ARCHITECTURE.md)** — How the system works
- **[Business Logic Review Guide](BUSINESS_LOGIC_REVIEW.md)** — Validate against requirements

---

## 🎯 Which Should I Choose?

| Scenario | Recommendation |
|----------|-----------------|
| New user, want free reviews | **Universal Agent** (start here) |
| Want to use with any IDE | **Universal Agent** |
| Already paying for Anthropic API | **MCP Server or VSCode Extension** |
| VS Code user, want convenience | **MCP Server** (best integrated experience) |
| Building your own IDE extension | **Use Universal Agent library API** |

---

## ⚡ Features

✅ **8 comprehensive review dimensions** (security, vulnerabilities, blockers, tests, debt, complexity, naming, business logic)  
✅ **Business logic validation** against Jira, BRS, architecture, Figma design specs  
✅ **Multiple integration options** for different workflows  
✅ **No external dependencies** for core functionality  
✅ **Streaming results** with adaptive thinking  
✅ **Zero cost option** (Universal Agent using IDE's LLM)  
✅ **Team-friendly** (always-on MCP server)  
✅ **Extensible** (add custom dimensions, providers, etc.)  

---

## 💰 Cost Estimates

| Method | Setup | Per File |
|--------|-------|----------|
| Universal Agent | $0 | $0 (uses IDE LLM) |
| MCP Server | $0 | $0.50—2.00 (Anthropic API) |
| VSCode Extension | $0 | $0.50—2.00 (Anthropic API) |

---

## 🚀 Next Steps

1. **[Start with Universal Agent](universal-agent/QUICKSTART.md)** — Get reviews working in 5 minutes, free
2. **[Read the Platform Overview](PLATFORM_OVERVIEW.md)** — Understand all options
3. **[Set up Business Logic Review](BUSINESS_LOGIC_REVIEW.md)** — Validate against requirements
4. **[Explore IDE Integrations](universal-agent/IDE-INTEGRATION.md)** — Deep dive per IDE

---

## 📄 License

ISC

