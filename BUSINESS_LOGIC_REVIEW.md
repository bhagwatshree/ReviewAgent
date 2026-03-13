# Business Logic Review Dimension

The Code Review Agent now includes a **Business Logic** dimension that validates code against your project's requirement documents.

## What It Checks

✅ **Requirements Implementation** — Does code implement all Jira acceptance criteria?  
✅ **BRS Alignment** — Does code match Business Requirements Specification?  
✅ **Architecture Adherence** — Does code follow architecture diagrams and design decisions?  
✅ **UI/UX Consistency** — Does code match Figma design specs?  
✅ **Data Model Correctness** — Are entities, relationships, and state transitions correct?  
✅ **Business Rules** — Pricing, eligibility, permissions, limits enforced correctly?  
✅ **Edge Cases** — Boundary conditions and special cases handled?  
✅ **Workflow Correctness** — Multi-step processes follow specification without data loss?  
✅ **Financial Accuracy** — Calculations (pricing, discounts, taxes, fees) correct per spec?  
✅ **Access Control** — User permissions/roles implemented per design?  

---

## Usage

### MCP Server

Provide business context when calling the review tool:

```json
{
  "code": "...",
  "options": {
    "businessContext": {
      "jiraPath": "docs/JIRA-123.json",
      "brsPath": "docs/requirements.md",
      "architecturePath": "docs/architecture.md",
      "figmaPath": "docs/figma-export.json"
    }
  }
}
```

### VSCode Extension / Chat

Tell Claude to include business context:

```
@code-review Review this file against our Jira requirements and architecture docs
```

(Files are loaded from `docs/` folder in your project root)

---

## Document Formats Supported

| Format | Extension | Example |
|--------|-----------|---------|
| **Markdown** | `.md` | `docs/requirements.md` |
| **PDF Text Export** | `.txt`, `.pdf` | `docs/spec.txt` |
| **JSON** | `.json` | `docs/jira-ticket.json` |
| **Figma Export** | `.json` | `docs/figma-design.json` |
| **Images** | `.png`, `.jpg` | `docs/architecture.png` |

---

## Document Organization

Place requirement documents in your project's `/docs/` folder:

```
your-project/
├── docs/
│   ├── JIRA-456.json          # Jira ticket export
│   ├── requirements.md         # Business Requirements Spec
│   ├── architecture.md         # Architecture & design decisions
│   ├── figma-design.json      # Figma design specs
│   └── user-flows.md          # User flow documentation
├── src/
└── ...
```

---

## Example: Review Against Jira Requirement

**Project setup:**
- Code file: `src/payment-processor.ts`
- Jira spec: `docs/JIRA-789-payment-flow.json`

**In Claude chat:**
```
Use the review_file tool to check src/payment-processor.ts against the business requirements.
Include the docs/JIRA-789-payment-flow.json file for context.
```

**Expected findings:**
- ❌ Missing refund logic mentioned in Jira acceptance criteria
- ❌ Tax calculation doesn't match BRS specification (should use COMPOUND, not SIMPLE)
- ❌ Payment timeout doesn't align with workflow in architecture doc
- ✅ Role-based access control matches Figma design

---

## Dimension Weight

**Business Logic**  
**Weight:** 20% (equal importance to Security & Critical Blockers)  
**Default Enabled:** Yes (included in all reviews)

---

## Tips

1. **Be specific in docs** — The more detailed your requirements, the better the review.
2. **Keep docs updated** — Stale specifications lead to false positives.
3. **Reference requirements** — Findings cite specific requirement sections for easier triage.
4. **Large documents** — Files > 8KB are truncated to avoid token bloat; keep docs focused.
5. **Combined reviews** — Business logic score is weighted with security, complexity, etc. for composite score.

---

## See Also

- [Main README](README.md)
- [Dimension Definitions](mcp-server/src/dimensions.ts)
