# Quick Start - Universal Code Review Agent

Get code reviews with **zero API calls** using your IDE's built-in LLM in 5 minutes.

---

## 60-Second Setup

```bash
# 1. Install
cd universal-agent
npm install & npm run build

# 2. Generate prompts for your file
node dist/cli.js --file src/auth.ts --format prompts

# 3. Copy prompts
# (Shows all 8 dimension prompts)

# 4. Paste into your IDE's chat
# (VS Code, Cursor, IntelliJ, Copilot, etc.)

# 5. Get review
# (LLM analyzes and returns JSON)
```

**That's it!** No API key, no setup, no external calls.

---

## Which IDE Are You Using?

### ⚡ Cursor (Fastest)
```bash
# Generate prompts
node dist/cli.js --file src/api.ts --format prompts

# Press Ctrl+K (or Cmd+K)
# Paste the USER PROMPT
# Get review instantly
```

### 📝 VS Code (with Claude extension)
```bash
# Generate prompts
node dist/cli.js --file src/service.ts --format prompts

# Press Ctrl+Shift+I (or Cmd+Shift+I)
# Paste SYSTEM PROMPT in custom instructions
# Paste USER PROMPT in chat
# Get review
```

### 🧠 IntelliJ / WebStorm / PyCharm
```bash
# Generate prompts
node dist/cli.js --file src/handler.ts --format prompts

# Press Alt+\ (or Cmd+\)
# Paste USER PROMPT in AI Assistant
# Get review
```

### 🔗 GitHub Copilot (Any IDE)
```bash
# Generate prompts
node dist/cli.js --file src/core.ts --format prompts

# Open Copilot Chat
# Paste USER PROMPT
# Get review
```

### 💻 Any Other IDE
```bash
# Generate prompts
node dist/cli.js --file src/app.ts --format prompts

# Open your IDE's chat/AI assistant
# Paste the prompt
# Get review
```

---

## 5-Minute Example

### Step 1: Generate Prompts
```bash
$ cd universal-agent
$ npm run build
$ node dist/cli.js --file ../mcp-server/src/reviewer.ts --format prompts
```

**Output:**
```
=== Code Review Prompt: Security ===
Weight: 20%

SYSTEM PROMPT:
You are a security-focused code reviewer...

USER PROMPT:
Review the following TypeScript code for **Security** issues.
File: `../mcp-server/src/reviewer.ts`

```typescript
[code here]
```

Return your review as a JSON block:
```json
{
  "score": <0-10>,
  "summary": "...",
  "findings": [...]
}
```

---

=== Code Review Prompt: Vulnerabilities ===
...
```

### Step 2: Copy & Paste
In VS Code:
1. Press `Ctrl+Shift+I` → Claude chat opens
2. Copy the **USER PROMPT** from above
3. Paste into chat
4. Claude analyzes your code

**Claude's Response:**
```json
{
  "score": 7,
  "summary": "Code follows security best practices but missing input validation on one endpoint.",
  "findings": [
    {
      "severity": "MEDIUM",
      "title": "Missing Input Validation",
      "description": "User input not validated before database query",
      "line": 156,
      "suggestion": "Add schema validation: validate(input, userSchema)",
      "cwe_id": "CWE-20"
    }
  ]
}
```

### Step 3: Repeat for Each Dimension
Send all 8 prompts:
1. Security ✅
2. Vulnerabilities
3. Critical Blockers
4. Test Coverage
5. Tech Debt
6. Complexity
7. Naming Conventions
8. Business Logic

Each returns JSON findings.

### Step 4: Combine Results
```bash
# Save all JSON responses to a file
# Then parse with Universal Agent
code-review-agent --file src/api.ts --format json < responses.json
```

**Output:** Professional markdown report!

---

## With Business Requirements

Want to review code against Jira tickets and requirements? Add them!

### Setup
```bash
# Place requirement documents in /docs/
mkdir docs
cp your-jira-ticket.json docs/JIRA-456.json
cp requirements.md docs/requirements.md
cp architecture.md docs/architecture.md
```

### Generate Prompts
```bash
node dist/cli.js --file src/checkout.ts \
  --jira docs/JIRA-456.json \
  --brs docs/requirements.md \
  --architecture docs/architecture.md \
  --format prompts
```

The **Business Logic** dimension prompt will now include all your requirement documents!

---

## Check Your Code Now!

### Example 1: TypeScript File
```bash
node dist/cli.js --file src/auth.ts --format prompts | head -50
```

### Example 2: Python File
```bash
node dist/cli.js --file app.py --format prompts
```

### Example 3: Go File
```bash
node dist/cli.js --file handler.go --format prompts
```

---

## Output Options

### Prompts (for IDE chat)
```bash
code-review-agent --file src/app.ts --format prompts
```
Shows all 8 prompts to copy into your IDE.

### JSON (for automation)
```bash
code-review-agent --file src/app.ts --format json > review.json
```
Machine-readable results for integration.

### Markdown (for reports)
```bash
code-review-agent --file src/app.ts --format markdown > review.md
```
Human-readable report for sharing.

---

## Common Questions

**Q: Which prompt should I use first?**  
A: Start with "Security" or "Critical Blockers" to catch important issues. Then do others.

**Q: Can I skip some dimensions?**  
A: Yes! Only send the prompts you care about. E.g., skip "Naming Conventions" if not relevant.

**Q: How long does a review take?**  
A: ~2-5 minutes per file (8 dimensions × 15-30 sec each for LLM to respond).

**Q: Will my code be sent to Anthropic?**  
A: NO! Everything stays in your IDE. The LLM is built-in to your IDE (Claude extension, Copilot, etc.).

**Q: What if I don't have an IDE with chat?**  
A: Use `claude.ai` in your browser, or generate prompts and ask any LLM API.

**Q: Can I review multiple files?**  
A: Yes! Run the command for each file separately, or write a bash loop.

---

## Next Steps

1. **[IDE Integration Guide](IDE-INTEGRATION.md)** — Detailed setup for each IDE
2. **[Business Logic Review](../BUSINESS_LOGIC_REVIEW.md)** — Validate against requirements
3. **[Architecture](ARCHITECTURE.md)** — How it works under the hood
4. **[Full README](README.md)** — Complete documentation

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "Command not found" | Run from `universal-agent` folder, or use `node dist/cli.js` |
| Prompts too long | Review smaller files first, or extract a single function |
| IDE chat times out | Try a smaller file, or break code into smaller sections |
| Need to parse JSON response | Copy responses into a file, save as JSON array `[{}, {}]` |

---

## That's It!

You now have AI code reviews working with your IDE — **no API key, no setup, no cost**.

🚀 **Start reviewing now:** `node dist/cli.js --file src/app.ts --format prompts`
