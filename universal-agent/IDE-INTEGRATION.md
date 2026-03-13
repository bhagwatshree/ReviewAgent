# IDE Integration Guide - Universal Code Review Agent

Use the Universal Code Review Agent with any IDE. Each IDE has slightly different workflows, but the core workflow is the same:

1. Generate review prompts
2. Copy prompts into your IDE's chat
3. Get review from your IDE's built-in LLM
4. Copy response and format results

---

## VS Code + Claude Extension

### Prerequisites
- VS Code
- [Claude for VS Code](https://marketplace.visualstudio.com/items?itemName=anthropic.claude-vscode) extension installed
- Universal Agent CLI available

### Workflow

1. **Generate prompts:**
   ```bash
   code-review-agent --file src/auth.ts --format prompts
   ```

2. **Open Claude chat:**
   - Press `Ctrl+Shift+I` (or `Cmd+Shift+I` on Mac)
   - Claude chat panel opens

3. **Set context (system message):**
   - Click the gear icon or settings
   - Paste the **SYSTEM PROMPT** into "Custom Instructions"
   - This sets Claude's behavior for this chat

4. **Send first prompt:**
   - In the chat, paste the **USER PROMPT** for the first dimension (e.g., "Security")
   - Send the message
   - Claude analyzes and returns JSON with findings

5. **Repeat for each dimension:**
   - Generate prompts outputs 8 prompts (one per dimension)
   - Send each USER PROMPT sequentially
   - Each returns a JSON review result

6. **Collect responses:**
   - Copy all JSON responses into a single file `reviews.json`
   - Format as array: `[{dimension results}, ...]`

---

## Cursor IDE

### Prerequisites
- [Cursor](https://cursor.com/) installed
- Universal Agent CLI available

### Workflow (Faster!)

1. **Generate prompts:**
   ```bash
   code-review-agent --file src/api.ts --format prompts
   ```

2. **Open Cursor Chat:**
   - Press `Ctrl+K` (or `Cmd+K` on Mac)
   - Cursor chat opens with context awareness

3. **Paste prompt:**
   - Copy the **USER PROMPT**
   - Paste into chat
   - Cursor's LLM automatically respects system context

4. **Get instant review:**
   - Cursor returns formatted JSON immediately
   - Copy the response

5. **Repeat for each dimension:**
   - Paste next prompt
   - Get next review
   - Very fast workflow (< 30 seconds per file typically)

**Cursor Tip:** Cursor can parse your code context automatically. The review will often be more accurate because Cursor sees your project structure.

---

## IntelliJ / JetBrains IDEs

Works with: IntelliJ IDEA, WebStorm, PyCharm, RubyMine, GoLand, etc.

### Prerequisites
- JetBrains IDE (2023.3+)
- AI Assistant plugin enabled
- Universal Agent CLI available

### Workflow

1. **Generate prompts:**
   ```bash
   code-review-agent --file src/service.ts --format prompts
   ```

2. **Open AI Assistant:**
   - Press `Alt + \` (or `Cmd + \` on Mac)
   - Or: `Tools > AI Assistant > Show AI Assistant`
   - AI Assistant panel opens on the right

3. **Paste prompt:**
   - Select the **USER PROMPT** for first dimension
   - Copy to clipboard
   - Paste in AI Assistant

4. **Get review:**
   - JetBrains AI returns analysis
   - Copy the JSON response

5. **Repeat for other dimensions:**
   - Same process, very integrated

### Pro Tip for JetBrains
After each prompt, you can right-click on the code and select **"Ask AI"** to focus the analysis on specific methods or classes.

---

## Vim / Neovim + Copilot

### Prerequisites
- Neovim or Vim 9+
- [vim-copilot](https://github.com/github/copilot.vim) or [cmp-copilot](https://github.com/zbirenbaum/copilot.cmp)
- Universal Agent CLI available

### Workflow

1. **Generate prompts:**
   ```bash
   code-review-agent --file src/handler.rs --format prompts
   ```

2. **In Vim, open chat:**
   - `:Copilot chat` or similar command (depends on extension)
   - Copilot chat opens

3. **Paste prompt:**
   - Paste **USER PROMPT**
   - Get review

4. **Alternative: Use in split:**
   - Create a new buffer for the review
   - Paste prompts and responses manually
   - Format with `:set filetype=json` for syntax highlighting

---

## GitHub Copilot (Any IDE)

GitHub Copilot is available in VS Code, JetBrains, Vim, and others. Workflow is identical:

1. Generate prompts: `code-review-agent --file src/app.ts --format prompts`
2. Open Copilot Chat
3. Paste USER PROMPT
4. Get review
5. Repeat for each dimension

---

## Manual CLI Workflow (Any IDE)

If your IDE doesn't have chat, use the CLI directly:

### Setup

```bash
# Create docs folder
mkdir docs

# Generate all prompts to a file
code-review-agent --file src/complex.ts --format prompts > prompts.txt
```

### Process

1. **Open `prompts.txt` in your editor**
   - Shows all 8 dimension prompts

2. **For each prompt:**
   - Copy the USER PROMPT
   - Go to [Claude.ai](https://claude.ai) in browser
   - Paste prompt
   - Get JSON response
   - Copy response

3. **Combine all responses:**
   ```bash
   # Create responses.json with all JSON responses as array
   cat responses.json | code-review-agent --file src/complex.ts --format json
   ```

---

## With Business Requirements

Use documents from `/docs/` folder with any IDE:

```bash
code-review-agent \
  --file src/checkout.ts \
  --jira docs/JIRA-789.json \
  --brs docs/checkout-spec.md \
  --architecture docs/payment-flow.md \
  --format prompts
```

The business logic review dimension will include these documents for context.

---

## Comparison: IDE Prompt Processing Speed

| IDE | Speed | Notes |
|-----|-------|-------|
| Cursor | ⚡⚡⚡ Fastest | Most responsive, best for quick reviews |
| VS Code (Claude) | ⚡⚡ Fast | Smooth, integrated experience |
| GitHub Copilot | ⚡⚡ Fast | Works anywhere Copilot is available |
| Claude.ai (web) | ⚡⚡ Fast | No installation needed |
| IntelliJ AI | ⚡ Moderate | Very integrated with code context |
| Vim + Copilot | ⚡⚡ Fast | Terminal-based workflow |

---

## Tips & Tricks

### Tip 1: Batch Reviews
```bash
# Review multiple files
for file in src/*.ts; do
  code-review-agent --file "$file" --format json >> reviews.json
done
```

### Tip 2: Skip Dimensions You Don't Need
In the generated prompts, you can skip dimensions by not sending those prompts:
- Only review "Security" and "Business Logic"
- Saves time for focused reviews

### Tip 3: Use Project Context
When your IDE has your project open:
- Claude, Copilot, Cursor can reference other files
- They understand your architecture better
- Reviews are more accurate

### Tip 4: Review with Requirements
Always include business documents:
```bash
code-review-agent --file src/auth.ts \
  --jira docs/requirements.json \
  --format prompts
```

Business logic review becomes much more valuable!

### Tip 5: Store Template Commands
```bash
# ~/.bashrc or equivalent
alias review="code-review-agent --format prompts"
alias review-with-reqs="code-review-agent --jira docs/reqs.json --format prompts"

# Usage:
review --file src/app.ts
```

---

## Troubleshooting

**Q: Prompts are too long to paste**
- Use `--file` to review specific function only
- Extract function to temp file
- Review just that function

**Q: IDE chat times out**
- Try smaller files first
- Some IDEs have token limits
- Use `--format prompts` to see exact tokens being sent

**Q: Need to review file with external dependencies**
- Include imports in the prompt context
- Or provide a `--architecture` doc explaining the APIs

**Q: Want to integrate with my IDE extension**
- Use the NPM package: `code-review-universal-agent`
- Implement your IDE provider extending `IDEProvider`
- Call `generateReviewPrompts()` and `executeReview()`

---

## See Also

- [Main README](README.md)
- [Universal Agent CLI Help](README.md#quick-start)
- [Business Logic Review](../BUSINESS_LOGIC_REVIEW.md)
