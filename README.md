# Code Review IDE Agent

AI-powered code review directly inside your IDE — powered by Claude Opus 4.6 with adaptive thinking.

Two integration methods — pick the one that fits your IDE:

| Method | Works In |
|--------|----------|
| **MCP Server** | VSCode (Claude extension), Cursor, IntelliJ (MCP plugin), Claude Desktop |
| **VSCode Extension** | VSCode only — native `@code-review` chat participant + right-click commands |

---

## Option 1 — MCP Server (Universal)

The MCP server exposes 5 tools that any MCP-compatible client can call.

### Setup

```bash
cd code_review_ide/mcp-server
npm install
npm run build
```

### VSCode (Claude extension or Copilot with MCP)

Add to `.vscode/mcp.json` in your project root (or global `~/.vscode/mcp.json`):

```json
{
  "servers": {
    "code-review": {
      "type": "stdio",
      "command": "node",
      "args": ["<absolute-path>/code_review_ide/mcp-server/dist/index.js"],
      "env": {
        "ANTHROPIC_API_KEY": "${env:ANTHROPIC_API_KEY}"
      }
    }
  }
}
```

Then in the VSCode chat panel (Claude or Copilot):
```
Use the review_file tool to review src/auth.ts
```

### Cursor IDE

Add to `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "code-review": {
      "command": "node",
      "args": ["<absolute-path>/code_review_ide/mcp-server/dist/index.js"],
      "env": {
        "ANTHROPIC_API_KEY": "sk-ant-your-key"
      }
    }
  }
}
```

Restart Cursor. Then in the chat:
```
@code-review review the selected code for security issues
```

### Claude Desktop

Add to `~/AppData/Roaming/Claude/claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "code-review": {
      "command": "node",
      "args": ["D:/Claude/Loyalty_Program/code_review_ide/mcp-server/dist/index.js"],
      "env": {
        "ANTHROPIC_API_KEY": "sk-ant-your-key"
      }
    }
  }
}
```

Restart Claude Desktop. The tools appear automatically.

### IntelliJ / JetBrains

1. Install the **MCP Host plugin** from JetBrains Marketplace (search "MCP")
2. Go to Settings → Tools → MCP → Add Server
3. Set command: `node <path>/dist/index.js`
4. Set env: `ANTHROPIC_API_KEY=sk-ant-your-key`

Or use the **HTTP bridge** for IntelliJ without a plugin — see `mcp-server/http-bridge/` (coming soon).

---

## Option 2 — VSCode Extension (Native)

Full native integration with VSCode's Chat Participant API and editor commands.

### Install

```bash
cd code_review_ide/vscode-extension
npm install
npm run build

# Package as .vsix
npx vsce package

# Install
code --install-extension code-review-agent-1.0.0.vsix
```

### Set your API key

Open VSCode Settings (`Ctrl+,`) → search **Code Review** → paste your `ANTHROPIC_API_KEY`.

Or set the environment variable before launching VSCode:
```bash
# Windows
set ANTHROPIC_API_KEY=sk-ant-your-key
code .

# macOS/Linux
export ANTHROPIC_API_KEY=sk-ant-your-key
code .
```

### Using the Chat Participant

Open the chat panel (`Ctrl+Alt+I` with GitHub Copilot, or via the Claude extension).

```
@code-review /file
```
Review the currently open file across all 7 dimensions.

```
@code-review /quick
```
Fast security + critical blockers scan (< 30 seconds).

```
@code-review /security
```
Deep security + vulnerability analysis.

```
@code-review /full
```
Full review: security, vulnerabilities, critical blockers, test coverage, tech debt, complexity, naming.

```
@code-review /explain SQL injection found in getUserById — string concatenation with req.params.id
```
Deep explanation of a specific finding with before/after code examples.

### Using Editor Commands

**Right-click menu:**
- `Code Review: Review Selection` — review highlighted code
- `Code Review: Review Current File` — review the whole file
- `Code Review: Quick Security Scan` — fast CRITICAL scan

**Command Palette** (`Ctrl+Shift+P`):
- `Code Review: Review Selection`
- `Code Review: Review Current File`
- `Code Review: Quick Security Scan`

Results open as a **Markdown preview** in a side panel.

---

## MCP Tools Reference

| Tool | Description |
|------|-------------|
| `review_selection` | Review a code snippet (pass `code` string) |
| `review_file` | Review a file by absolute path |
| `review_quick` | Fast scan: security + critical blockers + vulnerabilities |
| `explain_finding` | Deep explanation of a specific finding |
| `list_dimensions` | List all available review dimensions |

### Example: review a file via MCP

```json
{
  "tool": "review_file",
  "arguments": {
    "file_path": "/Users/me/project/src/auth/login.ts",
    "dimensions": ["security", "critical_blockers"],
    "context": "This is the main login endpoint. LP-42: JWT tokens not expiring after logout."
  }
}
```

### Example: review selected code

```json
{
  "tool": "review_selection",
  "arguments": {
    "code": "const query = `SELECT * FROM users WHERE id = ${req.params.id}`;",
    "language": "TypeScript",
    "dimensions": ["security", "vulnerabilities"]
  }
}
```

---

## Review Dimensions

| Dimension | Weight | What it checks |
|-----------|--------|----------------|
| **Security** | 20% | Auth bypasses, XSS, injection, hardcoded secrets, CORS, IDOR |
| **Vulnerabilities** | 15% | CVE patterns, prototype pollution, ReDoS, SSRF, timing attacks |
| **Critical Blockers** | 20% | Unimplemented flows, crash risks, data integrity, missing transactions |
| **Test Coverage** | 15% | Missing tests, untested paths, edge cases, assertion quality |
| **Tech Debt** | 10% | TODOs, dead code, deprecated APIs, duplication, magic numbers |
| **Complexity** | 10% | Cyclomatic complexity, deep nesting, long functions, boolean traps |
| **Naming Conventions** | 10% | Wrong case, vague names, inconsistency, misleading names |

---

## Adding a Custom Dimension (MCP Server)

Edit `mcp-server/src/dimensions.ts` — add a new entry:

```typescript
export const DIMENSIONS: Record<DimensionKey, Dimension> = {
  // ... existing dimensions ...
  performance: {
    name: "performance",
    displayName: "Performance",
    weight: 0.10,
    systemPrompt: `You are a performance engineer. Check for: N+1 queries,
unbounded DB queries, synchronous blocking in async paths, missing
pagination, React re-render traps, unthrottled event listeners.`,
  },
};
```

Add `"performance"` to the `DimensionKey` union type, rebuild, and pass `dimensions: ["performance"]` in tool calls.

---

## Project Structure

```
code_review_ide/
├── mcp-server/              # Universal MCP server (TypeScript/Node)
│   ├── src/
│   │   ├── index.ts         # MCP server entry — 5 tools exposed
│   │   ├── reviewer.ts      # Claude API streaming engine
│   │   └── dimensions.ts    # 7 dimension definitions + system prompts
│   ├── package.json
│   └── tsconfig.json
│
└── vscode-extension/        # VSCode native extension
    ├── src/
    │   ├── extension.ts     # Chat participant + editor commands
    │   └── reviewer.ts      # Claude API streaming engine (VSCode-aware)
    ├── package.json         # Extension manifest
    └── tsconfig.json
```
