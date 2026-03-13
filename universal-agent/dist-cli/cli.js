#!/usr/bin/env node
#!/usr/bin/env node
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};

// src/dimensions.ts
function getDimensionSpec(dimension) {
  return DIMENSION_SPECS[dimension];
}
var DIMENSION_SPECS, ALL_DIMENSIONS;
var init_dimensions = __esm({
  "src/dimensions.ts"() {
    "use strict";
    DIMENSION_SPECS = {
      security: {
        name: "security",
        displayName: "Security",
        weight: 0.2,
        systemPrompt: `You are a security-focused code reviewer specializing in application security.

SECURITY REVIEW SCOPE:
- Authentication stubs, bypasses, or missing auth guards
- CORS misconfigurations (wildcard origins in production)
- XSS vectors: dangerouslySetInnerHTML, innerHTML, eval()
- SQL/NoSQL injection: string-concatenated queries, missing parameterization
- Hardcoded secrets, API keys, passwords, tokens in source
- Insecure direct object references (IDOR)
- Missing rate limiting on auth endpoints
- JWT: weak algorithms (none, HS256 with weak secret), missing expiry validation
- Insecure deserialization
- Path traversal in file operations
- Command injection via shell execution with user input
- Missing HTTPS enforcement
- Sensitive data in logs or error responses

For each issue cite the CWE ID (e.g., CWE-79 for XSS). Score 10 if no security issues, 0 if critical auth bypass exists.`
      },
      vulnerabilities: {
        name: "vulnerabilities",
        displayName: "Vulnerabilities",
        weight: 0.15,
        systemPrompt: `You are a vulnerability researcher reviewing code for exploitable weaknesses.

VULNERABILITY REVIEW SCOPE:
- CVE-prone patterns: outdated dependency version ranges in package.json/requirements.txt
- Prototype pollution: object spread with untrusted input, Object.assign({}, req.body)
- ReDoS: catastrophic backtracking in regex on user-controlled input
- SSRF: URL fetching without allowlist validation
- Timing attacks in comparison functions (use constant-time comparison for secrets)
- Mass assignment: spreading req.body directly onto DB models
- Open redirect: redirect targets taken from query parameters without validation
- XXE in XML parsers with external entities enabled
- Zip/archive extraction without path sanitization (zip slip)
- Race conditions in file or database operations

Score 10 if no exploitable vulnerabilities, 0 if remote code execution possible.`
      },
      critical_blockers: {
        name: "critical_blockers",
        displayName: "Critical Blockers",
        weight: 0.2,
        systemPrompt: `You are a senior engineer reviewing code for correctness blockers that would prevent production deployment.

CRITICAL BLOCKERS SCOPE:
- Unimplemented code paths: TODO/FIXME in critical flows (auth, payment, data integrity)
- Missing error handling on database transactions \u2014 data loss risk
- Crash risks: unhandled promise rejections, missing null checks on user-facing paths
- Business logic errors: off-by-one in tier calculations, incorrect monetary rounding
- Data integrity: missing DB transaction wrapping for multi-step writes
- Infinite loops or unbounded recursion without base cases
- Missing input validation on API boundaries
- Broken authentication flows (e.g., auth check after data access)
- Broken or missing rollback logic
- Hardcoded limits that will break at scale (e.g., loading all rows for pagination)

Score 10 if production-ready, 0 if system would crash or corrupt data on first real use.`
      },
      test_coverage: {
        name: "test_coverage",
        displayName: "Test Coverage",
        weight: 0.15,
        systemPrompt: `You are a testing specialist reviewing code for test adequacy and quality.

TEST COVERAGE SCOPE:
- Source-to-test file ratio (expect at least 1 test file per module)
- Critical paths without tests: auth, payment processing, data mutations
- Happy path vs edge case coverage (boundary values, empty input, null/undefined)
- Missing error path tests (what happens when DB is down, API returns 500)
- Integration tests for API endpoints
- Test quality: tests that only assert truthy, no assertions, or test implementation not behavior
- Mocking strategy: over-mocked tests that don't catch real bugs
- Missing snapshot or contract tests for UI components
- Performance tests for endpoints under load

Score 10 if comprehensive coverage including edge cases, 0 if no tests exist.`
      },
      tech_debt: {
        name: "tech_debt",
        displayName: "Tech Debt",
        weight: 0.1,
        systemPrompt: `You are a software architect reviewing code for maintainability and technical debt.

TECH DEBT SCOPE:
- TODO/FIXME/HACK comments in production code
- Dead code: unreachable branches, commented-out blocks, unused exports
- Deprecated API usage (check for .bind() patterns, callback-style async, moment.js, etc.)
- Copy-paste duplication: identical logic in 3+ places that should be a shared function
- God objects/functions: single function doing 5+ distinct things
- Hardcoded magic numbers and strings without named constants
- Missing abstraction layers (direct DB queries in route handlers)
- Inconsistent error handling approaches (mix of callbacks, promises, async/await)
- Overly deep nesting (>4 levels) indicating missing early returns or extractions
- Stale dependencies with known newer alternatives

Score 10 if clean and maintainable, 0 if the codebase is unmaintainable.`
      },
      complexity: {
        name: "complexity",
        displayName: "Complexity",
        weight: 0.1,
        systemPrompt: `You are a code quality engineer reviewing for cognitive and cyclomatic complexity.

COMPLEXITY SCOPE:
- Functions with cyclomatic complexity > 10 (count if/else/switch/for/while/catch/&&/||)
- Functions > 50 lines \u2014 extract sub-functions
- Parameter lists > 5 \u2014 use options object pattern
- Nested ternary expressions
- Deeply nested callbacks or promise chains (>3 levels)
- Class/module with > 200 lines without clear separation of concerns
- Switch statements with > 7 cases that could be a lookup table or polymorphism
- Mixed abstraction levels within one function
- Boolean trap parameters (e.g., doThing(true, false, true))
- Implicit ordering dependencies between functions

Score 10 if all functions are simple and readable, 0 if the code requires a complexity analyzer to understand.`
      },
      naming_conventions: {
        name: "naming_conventions",
        displayName: "Naming Conventions",
        weight: 0.1,
        systemPrompt: `You are a code quality reviewer specializing in naming and consistency.

NAMING CONVENTIONS SCOPE:

JavaScript/TypeScript:
- camelCase for variables and functions, PascalCase for classes/components/types
- UPPER_SNAKE_CASE for module-level constants
- Boolean variables: is/has/can prefix (isLoading, hasError, canEdit)
- Avoid single-letter names outside loops (i, j are fine in for loops)

Python:
- snake_case for variables and functions, PascalCase for classes
- UPPER_SNAKE_CASE for constants

General:
- Vague names: data, info, temp, obj, thing, value, result \u2014 these hide intent
- Misleading names: updateUser that also deletes, getProducts that mutates state
- Inconsistent naming for the same concept (userId vs user_id vs uid in same codebase)
- DB column name \u2194 app field name mapping inconsistencies
- Abbreviations that require domain knowledge (acct, usr, pmt)

Score 10 if all names are clear and consistent, 0 if the codebase requires constant mental translation.`
      },
      business_logic: {
        name: "business_logic",
        displayName: "Business Logic",
        weight: 0.2,
        systemPrompt: `You are a senior product engineer and business analyst reviewing code for business logic correctness.

BUSINESS LOGIC REVIEW SCOPE (using requirement documents provided):
- Requirements implementation: Does the code implement all specified Jira acceptance criteria?
- BRS (Business Requirements Specification) alignment: Does the implementation match the business requirements document?
- Architecture adherence: Does code follow the architecture diagram and design decisions?
- UI/UX consistency: Does code match Figma design specs and user flow?
- Data model correctness: Are entities, relationships, and state transitions correctly implemented?
- Business rule enforcement: Are all business rules implemented (pricing, eligibility, permissions, limits)?
- Edge case handling: Are boundary conditions and special cases from requirements handled?
- Workflow correctness: Do multi-step processes follow the specified sequence without data loss?
- User permission/role implementation: Are access controls matching the design specification?
- Financial/calculation accuracy: Are calculations (pricing, discounts, taxes, fees) correct per spec?
- Integration points: Do external service calls match documented contracts?
- Error handling for business rules: Are violations caught and reported correctly?

When reviewing, cite specific requirements or requirement document sections. Score 10 if code fully implements all business requirements, 0 if critical business logic is missing or incorrect.`
      }
    };
    ALL_DIMENSIONS = Object.keys(DIMENSION_SPECS);
  }
});

// src/prompt-builder.ts
import { readFile } from "fs/promises";
import { resolve, join, dirname, extname } from "path";
function detectLanguage(code, filePath) {
  if (filePath) {
    const ext = filePath.split(".").pop()?.toLowerCase();
    const extMap = {
      ts: "TypeScript",
      tsx: "TypeScript (React)",
      js: "JavaScript",
      jsx: "JavaScript (React)",
      py: "Python",
      java: "Java",
      kt: "Kotlin",
      go: "Go",
      rb: "Ruby",
      cs: "C#",
      php: "PHP",
      swift: "Swift",
      rs: "Rust",
      cpp: "C++",
      c: "C",
      sql: "SQL",
      sh: "Shell",
      yaml: "YAML",
      yml: "YAML"
    };
    if (ext && extMap[ext]) return extMap[ext];
  }
  if (code.includes("import React") || code.includes("jsx"))
    return "TypeScript (React)";
  if (code.includes("def ") && code.includes(":")) return "Python";
  if (code.includes("func ") && code.includes("package ")) return "Go";
  if (code.includes("public class ")) return "Java";
  return "TypeScript";
}
async function loadDocument(docPath, projectRoot) {
  if (!docPath) return null;
  try {
    const fullPath = resolve(projectRoot, docPath);
    const content = await readFile(fullPath, "utf-8");
    const ext = extname(fullPath).toLowerCase();
    if (ext === ".json") {
      try {
        const parsed = JSON.parse(content);
        return JSON.stringify(parsed, null, 2);
      } catch {
        return content;
      }
    } else if ([".pdf", ".txt", ".md", ".markdown"].includes(ext)) {
      return content;
    } else if ([".png", ".jpg", ".jpeg", ".gif", ".webp"].includes(ext)) {
      return `[Image: ${docPath}]
(Refer to design documents in /docs/ for visual specs)`;
    } else {
      return content;
    }
  } catch {
    return null;
  }
}
async function buildBusinessContext(businessContext, projectRoot) {
  if (!businessContext) return "";
  const contextParts = [];
  const docs = {
    Jira: businessContext.jiraPath,
    "BRS (Business Specification)": businessContext.brsPath,
    Architecture: businessContext.architecturePath,
    "Figma Design": businessContext.figmaPath
  };
  for (const [label, docPath] of Object.entries(docs)) {
    if (!docPath) continue;
    const searchPath = docPath.startsWith("docs/") ? docPath : join("docs", docPath);
    const content = await loadDocument(searchPath, projectRoot);
    if (content) {
      const maxLen = 8e3;
      const truncated = content.length > maxLen ? content.substring(0, maxLen) + "\n... [truncated] ..." : content;
      contextParts.push(`## ${label}
${truncated}`);
    }
  }
  return contextParts.length > 0 ? `

**Business Requirements & Design Context:**

${contextParts.join("\n\n---\n\n")}` : "";
}
function buildUserMessage(code, language, filePath, additionalContext, businessContextStr, dimension) {
  const fileRef = filePath ? `
File: \`${filePath}\`` : "";
  const additionalBlock = additionalContext ? `

**Additional Context:**
${additionalContext}` : "";
  const businessBlock = businessContextStr;
  const dimensionName = getDimensionSpec(dimension).displayName;
  return `Review the following ${language} code for **${dimensionName}** issues.${fileRef}${additionalBlock}${businessBlock}

\`\`\`${language.toLowerCase().replace(/\s.*/, "")}
${code}
\`\`\`

Return your review as a JSON block in this exact format:
\`\`\`json
{
  "score": <0-10 integer>,
  "summary": "<2-3 sentence overall assessment>",
  "findings": [
    {
      "severity": "<CRITICAL|HIGH|MEDIUM|LOW|INFO>",
      "title": "<short title>",
      "description": "<what the issue is and why it matters>",
      "line": <line number if applicable, else null>,
      "suggestion": "<concrete fix>",
      "cwe_id": "<CWE-NNN if applicable, else null>"
    }
  ]
}
\`\`\`

List only real findings \u2014 do not invent issues. If the code is clean for this dimension, return an empty findings array with a high score.`;
}
async function generateReviewPrompts(request) {
  const projectRoot = request.filePath ? dirname(request.filePath) : process.cwd();
  const language = request.language || detectLanguage(request.code, request.filePath);
  const dimensions = request.dimensions || ALL_DIMENSIONS;
  const businessContextStr = await buildBusinessContext(
    request.businessContext,
    projectRoot
  );
  const prompts = [];
  let totalContextSize = 0;
  for (const dimension of dimensions) {
    const spec = getDimensionSpec(dimension);
    const contextForMessage = dimension === "business_logic" ? businessContextStr : "";
    const userPrompt = buildUserMessage(
      request.code,
      language,
      request.filePath,
      request.additionalContext,
      contextForMessage,
      dimension
    );
    prompts.push({
      dimension,
      displayName: spec.displayName,
      systemPrompt: spec.systemPrompt,
      userPrompt,
      weight: spec.weight
    });
    totalContextSize += spec.systemPrompt.length + userPrompt.length;
  }
  return {
    prompts,
    metadata: {
      fileName: request.filePath,
      language,
      documentCount: businessContextStr.length > 0 ? 1 : 0,
      totalContextSize
    }
  };
}
function formatPromptForManualEntry(prompt) {
  return `
=== Code Review Prompt: ${prompt.displayName} ===
Weight: ${(prompt.weight * 100).toFixed(0)}%

SYSTEM PROMPT:
${prompt.systemPrompt}

USER PROMPT:
${prompt.userPrompt}

---
Paste the USER PROMPT into your IDE's chat, and set the context/system message to the SYSTEM PROMPT above.
`;
}
var init_prompt_builder = __esm({
  "src/prompt-builder.ts"() {
    "use strict";
    init_dimensions();
  }
});

// src/html-reporter.ts
import { readdir, readFile as readFile2 } from "fs/promises";
import { join as join2 } from "path";
async function parsePromptFile(filePath, fileName) {
  try {
    const content = await readFile2(filePath, "utf-8");
    const findings = [];
    const dimensionMatches = content.matchAll(/=== Code Review Prompt: (.+?) ===/g);
    for (const match of dimensionMatches) {
      const dimension = match[1].trim();
      const severity = dimensionToSeverity[dimension] || "INFO";
      const systemPromptStart = content.indexOf("SYSTEM PROMPT:", match.index);
      const userPromptStart = content.indexOf("USER PROMPT:", match.index);
      if (systemPromptStart !== -1) {
        const systemPromptContent = content.substring(
          systemPromptStart + 13,
          userPromptStart !== -1 ? userPromptStart : content.length
        );
        const issues = extractIssuesFromPrompt(systemPromptContent, dimension);
        findings.push(...issues.map((issue, idx) => ({
          id: `${fileName}-${dimension}-${idx}`,
          dimension,
          severity,
          message: issue,
          file: fileName
        })));
      }
    }
    const summary = {
      total: findings.length,
      blockers: findings.filter((f) => f.severity === "BLOCKER").length,
      critical: findings.filter((f) => f.severity === "CRITICAL").length,
      major: findings.filter((f) => f.severity === "MAJOR").length,
      minor: findings.filter((f) => f.severity === "MINOR").length
    };
    return {
      file: fileName,
      path: filePath,
      findings,
      summary
    };
  } catch (error) {
    console.error(`Error parsing ${filePath}:`, error);
    return {
      file: fileName,
      path: filePath,
      findings: [],
      summary: { total: 0, blockers: 0, critical: 0, major: 0, minor: 0 }
    };
  }
}
function extractIssuesFromPrompt(promptText, dimension) {
  const issues = [];
  if (dimension === "Security") {
    const securityPoints = [
      "Authentication & authorization validation",
      "Hardcoded secrets or credentials check",
      "SQL/NoSQL injection prevention",
      "XSS vulnerability prevention",
      "CORS misconfiguration check",
      "JWT token security validation",
      "Rate limiting on sensitive endpoints",
      "Path traversal prevention"
    ];
    issues.push(...securityPoints);
  } else if (dimension === "Vulnerabilities") {
    issues.push(
      "Dependency vulnerability scan",
      "Deprecated API usage",
      "Known CVE checks",
      "Security library updates"
    );
  } else if (dimension === "Critical Blockers") {
    issues.push(
      "Unhandled error cases",
      "Missing null/undefined checks",
      "Data loss risks",
      "Memory leaks",
      "Infinite loops or deadlocks"
    );
  } else if (dimension === "Test Coverage") {
    issues.push(
      "Unit test coverage validation",
      "Error scenario handling",
      "Edge case testing",
      "Integration test presence"
    );
  } else if (dimension === "Tech Debt") {
    issues.push(
      "Code maintainability assessment",
      "Scalability concerns",
      "Architecture violations",
      "Code duplication"
    );
  } else if (dimension === "Complexity") {
    issues.push(
      "Cyclomatic complexity analysis",
      "Function length review",
      "Nested complexity check",
      "Readability assessment"
    );
  } else if (dimension === "Naming") {
    issues.push(
      "Variable naming clarity",
      "Function naming conventions",
      "Constant naming standards",
      "Class naming consistency"
    );
  } else if (dimension === "Business Logic") {
    issues.push(
      "Feature requirement validation",
      "Edge case handling",
      "Business rule compliance",
      "Data consistency check"
    );
  }
  return issues;
}
async function generateHTMLReport(projectPath, outputPath) {
  try {
    const reviewFiles = await findReviewFiles(projectPath);
    const fileReviews = [];
    for (const file of reviewFiles) {
      const fileName = file.replace("-review-prompts.txt", "");
      const review = await parsePromptFile(
        join2(projectPath, file),
        fileName
      );
      fileReviews.push(review);
    }
    const totalFindings = fileReviews.reduce((sum, f) => sum + f.summary.total, 0);
    const blockerCount = fileReviews.reduce((sum, f) => sum + f.summary.blockers, 0);
    const criticalCount = fileReviews.reduce((sum, f) => sum + f.summary.critical, 0);
    const reportData = {
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      files: fileReviews.sort((a, b) => b.summary.blockers - a.summary.blockers),
      summary: {
        totalFiles: fileReviews.length,
        totalFindings,
        blockerCount,
        criticalCount
      }
    };
    const html = createHTML(reportData);
    return html;
  } catch (error) {
    console.error("Error generating report:", error);
    throw error;
  }
}
async function findReviewFiles(projectPath) {
  try {
    const files = await readdir(projectPath);
    return files.filter((f) => f.endsWith("-review-prompts.txt"));
  } catch (error) {
    return [];
  }
}
function createHTML(data) {
  const date = new Date(data.timestamp).toLocaleString();
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Code Review Report - SonarQube Style</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      padding: 20px;
    }

    .container {
      max-width: 1400px;
      margin: 0 auto;
      background: white;
      border-radius: 12px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      overflow: hidden;
    }

    .header {
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      color: white;
      padding: 40px;
      text-align: center;
    }

    .header h1 {
      font-size: 32px;
      margin-bottom: 8px;
      font-weight: 700;
    }

    .header p {
      font-size: 14px;
      opacity: 0.8;
      margin-bottom: 20px;
    }

    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 20px;
      margin-top: 20px;
    }

    .metric-card {
      background: rgba(255, 255, 255, 0.1);
      padding: 20px;
      border-radius: 8px;
      border-left: 4px solid;
      backdrop-filter: blur(10px);
    }

    .metric-card.blocker {
      border-left-color: #ff4757;
    }

    .metric-card.critical {
      border-left-color: #ff6348;
    }

    .metric-card.major {
      border-left-color: #ffa502;
    }

    .metric-card.info {
      border-left-color: #1e90ff;
    }

    .metric-value {
      font-size: 32px;
      font-weight: 700;
      margin-bottom: 5px;
    }

    .metric-label {
      font-size: 13px;
      opacity: 0.8;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .content {
      padding: 40px;
    }

    .section-title {
      font-size: 20px;
      font-weight: 600;
      margin-bottom: 25px;
      color: #1a1a2e;
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .files-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 30px;
    }

    .files-table thead {
      background: #f8f9fa;
      border-bottom: 2px solid #e9ecef;
    }

    .files-table th {
      padding: 15px;
      text-align: left;
      font-weight: 600;
      color: #495057;
      font-size: 13px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .files-table tbody tr {
      border-bottom: 1px solid #e9ecef;
      transition: background-color 0.2s ease;
    }

    .files-table tbody tr:hover {
      background-color: #f8f9fa;
      cursor: pointer;
    }

    .files-table td {
      padding: 15px;
      color: #495057;
      font-size: 14px;
    }

    .file-name {
      font-weight: 500;
      color: #1a1a2e;
      max-width: 300px;
      word-break: break-word;
    }

    .severity-badge {
      display: inline-block;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-right: 5px;
    }

    .severity-blocker {
      background: #ffe0e0;
      color: #d32f2f;
    }

    .severity-critical {
      background: #fff3e0;
      color: #f57c00;
    }

    .severity-major {
      background: #fff9c4;
      color: #f9a825;
    }

    .severity-minor {
      background: #e3f2fd;
      color: #1976d2;
    }

    .severity-info {
      background: #f0f4c3;
      color: #689f38;
    }

    .finding-count {
      font-weight: 600;
      color: #1a1a2e;
    }

    .detail-row {
      display: none;
      background: #fafbfc;
    }

    .detail-row.open {
      display: table-row;
    }

    .detail-cell {
      padding: 20px !important;
    }

    .findings-list {
      list-style: none;
    }

    .findings-list li {
      padding: 10px 0;
      border-bottom: 1px solid #e9ecef;
      font-size: 13px;
      color: #495057;
      display: flex;
      align-items: flex-start;
      gap: 10px;
    }

    .findings-list li:last-child {
      border-bottom: none;
    }

    .findings-list li::before {
      content: '\u2022';
      color: #667eea;
      font-weight: bold;
      flex-shrink: 0;
      margin-top: 3px;
    }

    .dimension-group {
      margin-bottom: 15px;
    }

    .dimension-header {
      font-weight: 600;
      color: #1a1a2e;
      margin-bottom: 8px;
      font-size: 13px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .toggle-details {
      cursor: pointer;
      user-select: none;
      padding: 15px;
      background: #f8f9fa;
      border-radius: 4px;
      border: 1px solid #e9ecef;
      margin-bottom: 15px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      transition: background-color 0.2s ease;
    }

    .toggle-details:hover {
      background: #e9ecef;
    }

    .toggle-icon {
      transition: transform 0.2s ease;
      color: #667eea;
      font-size: 18px;
      font-weight: bold;
    }

    .toggle-details.open .toggle-icon {
      transform: rotate(180deg);
    }

    .footer {
      background: #f8f9fa;
      padding: 20px 40px;
      border-top: 1px solid #e9ecef;
      text-align: center;
      color: #6c757d;
      font-size: 12px;
    }

    @media print {
      body {
        background: white;
      }
      .container {
        box-shadow: none;
      }
      .detail-row {
        display: table-row !important;
      }
    }

    .no-findings {
      padding: 40px;
      text-align: center;
      color: #6c757d;
      font-size: 14px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>\u{1F4CA} Code Review Report</h1>
      <p>Generated ${date}</p>
      <div class="metrics-grid">
        <div class="metric-card blocker">
          <div class="metric-value">${data.summary.blockerCount}</div>
          <div class="metric-label">Blockers</div>
        </div>
        <div class="metric-card critical">
          <div class="metric-value">${data.summary.criticalCount}</div>
          <div class="metric-label">Critical</div>
        </div>
        <div class="metric-card major">
          <div class="metric-value">${data.summary.totalFindings}</div>
          <div class="metric-label">Total Issues</div>
        </div>
        <div class="metric-card info">
          <div class="metric-value">${data.summary.totalFiles}</div>
          <div class="metric-label">Files Reviewed</div>
        </div>
      </div>
    </div>

    <div class="content">
      <div class="section-title">\u{1F4C1} Files & Issues</div>

      ${data.files.length === 0 ? `
        <div class="no-findings">No review files found. Generate prompts first using the Universal Agent.</div>
      ` : `
        <table class="files-table">
          <thead>
            <tr>
              <th style="width: 35%;">File</th>
              <th style="width: 15%;">Blockers</th>
              <th style="width: 15%;">Critical</th>
              <th style="width: 15%;">Total</th>
              <th style="width: 20%;">Action</th>
            </tr>
          </thead>
          <tbody>
            ${data.files.map((fileReview, idx) => `
              <tr onclick="toggleDetails(${idx})">
                <td class="file-name">${fileReview.file}</td>
                <td><span class="severity-badge severity-blocker">${fileReview.summary.blockers}</span></td>
                <td><span class="severity-badge severity-critical">${fileReview.summary.critical}</span></td>
                <td><span class="finding-count">${fileReview.summary.total}</span></td>
                <td>
                  <button class="toggle-details" style="cursor: pointer; width: 100%; text-align: center;" onclick="event.stopPropagation();">
                    <span style="flex: 1;">View Details</span>
                    <span class="toggle-icon">\u25BC</span>
                  </button>
                </td>
              </tr>
              <tr class="detail-row" id="detail-${idx}">
                <td colspan="5" class="detail-cell">
                  <div class="dimension-group">
                    <div class="dimension-header">Review Dimensions</div>
                    ${fileReview.findings.length === 0 ? `
                      <p style="color: #6c757d; font-size: 13px;">No findings available yet. Configure dimensions in the Universal Agent.</p>
                    ` : `
                      <ul class="findings-list">
                        ${fileReview.findings.map((finding) => `
                          <li>
                            <span class="severity-badge severity-${finding.severity.toLowerCase()}">${finding.severity}</span>
                            <span><strong>${finding.dimension}:</strong> ${finding.message}</span>
                          </li>
                        `).join("")}
                      </ul>
                    `}
                  </div>
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      `}
    </div>

    <div class="footer">
      <p>Generated by Universal Code Review Agent \u2022 Zero API Cost Review Platform</p>
    </div>
  </div>

  <script>
    function toggleDetails(rowIdx) {
      const detailRow = document.getElementById(\`detail-\${rowIdx}\`);
      detailRow.classList.toggle('open');
    }

    // Keyboard navigation
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        document.querySelectorAll('.detail-row.open').forEach(row => {
          row.classList.remove('open');
        });
      }
    });
  </script>
</body>
</html>`;
}
async function saveHTMLReport(projectPath, outputFileName = "code-review-report.html") {
  const { writeFile } = await import("fs/promises");
  const html = await generateHTMLReport(projectPath, outputFileName);
  const outputPath = join2(projectPath, outputFileName);
  await writeFile(outputPath, html, "utf-8");
  return outputPath;
}
function generateHTMLFromResult(result, filePath) {
  const date = (/* @__PURE__ */ new Date()).toLocaleString();
  const { dimensions, compositeScore, grade } = result;
  const securityDim = dimensions.find((d) => d.dimension === "security");
  const securityScore = securityDim?.score ?? null;
  const passed = dimensions.filter((d) => d.score >= 7);
  const failed = dimensions.filter((d) => d.score < 7);
  const gradeColor = (g) => ({ "A+": "#00b894", A: "#00b894", B: "#0984e3", C: "#fdcb6e", D: "#e17055", F: "#d63031" })[g] ?? "#636e72";
  const scoreBar = (score) => {
    const pct = Math.round(score * 10);
    const color = score >= 7 ? "#00b894" : score >= 4 ? "#fdcb6e" : "#d63031";
    return `<div style="background:#eee;border-radius:4px;height:8px;width:100%;margin-top:4px;">
      <div style="width:${pct}%;background:${color};height:8px;border-radius:4px;transition:width .3s;"></div>
    </div>`;
  };
  const severityBadge = (s) => {
    const colors = {
      CRITICAL: "background:#ffe0e0;color:#d32f2f",
      HIGH: "background:#fff3e0;color:#e65100",
      MEDIUM: "background:#fff9c4;color:#f9a825",
      LOW: "background:#e3f2fd;color:#1976d2",
      INFO: "background:#f1f8e9;color:#558b2f"
    };
    return `<span style="display:inline-block;padding:2px 7px;border-radius:3px;font-size:11px;font-weight:600;${colors[s] ?? ""};">${s}</span>`;
  };
  const dimensionRows = dimensions.map((d, i) => {
    const isPassed = d.score >= 7;
    const statusBadge = isPassed ? `<span style="background:#d4edda;color:#155724;padding:3px 8px;border-radius:4px;font-size:12px;font-weight:600;">PASSED</span>` : `<span style="background:#f8d7da;color:#721c24;padding:3px 8px;border-radius:4px;font-size:12px;font-weight:600;">ISSUES</span>`;
    const findingsHtml = d.findings.length === 0 ? `<p style="color:#6c757d;font-size:13px;margin:0;">No issues found.</p>` : d.findings.map((f) => `
          <div style="border-left:3px solid ${f.severity === "CRITICAL" ? "#d63031" : f.severity === "HIGH" ? "#e17055" : "#fdcb6e"};padding:10px 14px;margin:6px 0;background:#fafafa;border-radius:0 4px 4px 0;">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
              ${severityBadge(f.severity)}
              <strong style="font-size:13px;">${f.title}</strong>
              ${f.line ? `<span style="color:#6c757d;font-size:12px;">line ${f.line}</span>` : ""}
              ${f.cwe_id ? `<code style="font-size:11px;background:#e9ecef;padding:1px 5px;border-radius:3px;">${f.cwe_id}</code>` : ""}
            </div>
            <p style="margin:0 0 4px;font-size:13px;color:#495057;">${f.description}</p>
            <p style="margin:0;font-size:12px;color:#0984e3;"><strong>Fix:</strong> ${f.suggestion}</p>
          </div>`).join("");
    return `
      <div style="border:1px solid #e9ecef;border-radius:8px;margin-bottom:12px;overflow:hidden;">
        <div onclick="toggle(${i})" style="display:flex;align-items:center;gap:16px;padding:16px 20px;cursor:pointer;background:#fff;user-select:none;" onmouseover="this.style.background='#f8f9fa'" onmouseout="this.style.background='#fff'">
          <div style="flex:1;">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;">
              <span style="font-weight:600;font-size:15px;">${d.displayName}</span>
              ${statusBadge}
              <span style="margin-left:auto;font-size:13px;color:#6c757d;">${(d.weight * 100).toFixed(0)}% weight</span>
            </div>
            ${scoreBar(d.score)}
          </div>
          <div style="text-align:right;min-width:80px;">
            <div style="font-size:22px;font-weight:700;color:${d.score >= 7 ? "#00b894" : d.score >= 4 ? "#e17055" : "#d63031"};">${d.score.toFixed(1)}<span style="font-size:13px;color:#adb5bd;">/10</span></div>
          </div>
          <div style="color:#adb5bd;font-size:18px;" id="icon-${i}">\u25BC</div>
        </div>
        <div id="detail-${i}" style="display:none;padding:0 20px 16px;border-top:1px solid #f0f0f0;">
          <p style="font-size:13px;color:#495057;margin:12px 0 10px;">${d.summary}</p>
          ${findingsHtml}
        </div>
      </div>`;
  }).join("");
  const passedList = passed.map(
    (d) => `<div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid #f0f0f0;">
      <span style="color:#00b894;font-size:18px;">\u2713</span>
      <span style="font-weight:500;">${d.displayName}</span>
      <span style="margin-left:auto;font-weight:600;color:#00b894;">${d.score.toFixed(1)}/10</span>
    </div>`
  ).join("");
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Code Review Report</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f4f6f9; min-height: 100vh; padding: 24px; }
    .container { max-width: 960px; margin: 0 auto; }
    @media print { body { background: white; padding: 0; } }
  </style>
</head>
<body>
  <div class="container">

    <!-- Header -->
    <div style="background:linear-gradient(135deg,#1a1a2e,#16213e);color:white;border-radius:12px;padding:32px 40px;margin-bottom:24px;">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:20px;">
        <div>
          <h1 style="font-size:26px;font-weight:700;margin-bottom:6px;">Code Review Report</h1>
          ${filePath ? `<p style="opacity:.7;font-size:14px;margin-bottom:4px;">${filePath}</p>` : ""}
          <p style="opacity:.6;font-size:13px;">Generated ${date}</p>
        </div>
        <div style="text-align:center;">
          <div style="font-size:60px;font-weight:800;color:${gradeColor(grade)};line-height:1;">${grade}</div>
          <div style="font-size:14px;opacity:.8;margin-top:4px;">Overall Grade</div>
          <div style="font-size:20px;font-weight:600;margin-top:2px;">${compositeScore.toFixed(1)}<span style="font-size:13px;opacity:.6;">/10</span></div>
        </div>
      </div>

      <!-- Top metric cards -->
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:16px;margin-top:28px;">
        <div style="background:rgba(255,255,255,.1);border-radius:8px;padding:16px;border-left:4px solid ${gradeColor(grade)};">
          <div style="font-size:28px;font-weight:700;">${compositeScore.toFixed(1)}</div>
          <div style="font-size:12px;opacity:.8;text-transform:uppercase;letter-spacing:.5px;margin-top:2px;">Quality Score</div>
        </div>
        <div style="background:rgba(255,255,255,.1);border-radius:8px;padding:16px;border-left:4px solid ${securityScore !== null && securityScore >= 7 ? "#00b894" : "#d63031"};">
          <div style="font-size:28px;font-weight:700;">${securityScore !== null ? securityScore.toFixed(1) : "N/A"}</div>
          <div style="font-size:12px;opacity:.8;text-transform:uppercase;letter-spacing:.5px;margin-top:2px;">Security Score</div>
        </div>
        <div style="background:rgba(255,255,255,.1);border-radius:8px;padding:16px;border-left:4px solid #00b894;">
          <div style="font-size:28px;font-weight:700;">${passed.length}</div>
          <div style="font-size:12px;opacity:.8;text-transform:uppercase;letter-spacing:.5px;margin-top:2px;">Passed</div>
        </div>
        <div style="background:rgba(255,255,255,.1);border-radius:8px;padding:16px;border-left:4px solid #e17055;">
          <div style="font-size:28px;font-weight:700;">${failed.length}</div>
          <div style="font-size:12px;opacity:.8;text-transform:uppercase;letter-spacing:.5px;margin-top:2px;">Need Attention</div>
        </div>
        <div style="background:rgba(255,255,255,.1);border-radius:8px;padding:16px;border-left:4px solid #ff4757;">
          <div style="font-size:28px;font-weight:700;">${dimensions.flatMap((d) => d.findings).filter((f) => f.severity === "CRITICAL").length}</div>
          <div style="font-size:12px;opacity:.8;text-transform:uppercase;letter-spacing:.5px;margin-top:2px;">Critical Issues</div>
        </div>
      </div>
    </div>

    <!-- Passed Dimensions -->
    ${passed.length > 0 ? `
    <div style="background:white;border-radius:12px;padding:24px;margin-bottom:24px;border:1px solid #e9ecef;">
      <h2 style="font-size:17px;font-weight:600;color:#155724;margin-bottom:16px;display:flex;align-items:center;gap:8px;">
        <span style="color:#00b894;">\u2713</span> Passed Dimensions (${passed.length})
      </h2>
      ${passedList}
    </div>` : ""}

    <!-- All Dimensions (expandable) -->
    <div style="background:white;border-radius:12px;padding:24px;border:1px solid #e9ecef;">
      <h2 style="font-size:17px;font-weight:600;color:#1a1a2e;margin-bottom:20px;">All Dimensions</h2>
      ${dimensionRows}
    </div>

    <div style="text-align:center;padding:20px;color:#adb5bd;font-size:12px;">Generated by Universal Code Review Agent</div>
  </div>

  <script>
    function toggle(i) {
      const el = document.getElementById('detail-' + i);
      const icon = document.getElementById('icon-' + i);
      const open = el.style.display === 'block';
      el.style.display = open ? 'none' : 'block';
      icon.textContent = open ? '\u25BC' : '\u25B2';
    }
  </script>
</body>
</html>`;
}
async function saveHTMLFromResult(result, outputPath, filePath) {
  const { writeFile } = await import("fs/promises");
  const html = generateHTMLFromResult(result, filePath);
  await writeFile(outputPath, html, "utf-8");
  return outputPath;
}
var dimensionToSeverity;
var init_html_reporter = __esm({
  "src/html-reporter.ts"() {
    "use strict";
    dimensionToSeverity = {
      "Security": "CRITICAL",
      "Vulnerabilities": "CRITICAL",
      "Critical Blockers": "BLOCKER",
      "Test Coverage": "MAJOR",
      "Tech Debt": "MAJOR",
      "Complexity": "MINOR",
      "Naming": "MINOR",
      "Business Logic": "MAJOR"
    };
  }
});

// src/diff-fetcher.ts
import { execFile } from "child_process";
import { promisify } from "util";
function parseDiffArgs(text) {
  const trimmed = text.trim();
  const ghMatch = trimmed.match(
    /https?:\/\/github\.com\/([^/]+)\/([^/]+)\/compare\/([^.]+)\.\.\.?(.+)/
  );
  if (ghMatch) {
    return {
      type: "github",
      owner: ghMatch[1],
      repo: ghMatch[2],
      from: ghMatch[3],
      to: ghMatch[4].split("?")[0]
    };
  }
  const glMatch = trimmed.match(
    /https?:\/\/(gitlab\.[^/]+)\/(.+?)\/-?\/compare\/([^.]+)\.\.\.?(.+)/
  );
  if (glMatch) {
    return {
      type: "gitlab",
      host: glMatch[1],
      projectPath: glMatch[2],
      from: glMatch[3],
      to: glMatch[4].split("?")[0]
    };
  }
  if (/^(remote|upstream)$/i.test(trimmed)) {
    return { type: "remote" };
  }
  if (!trimmed) {
    return { type: "local", from: "HEAD~1", to: "HEAD" };
  }
  const parts = trimmed.split(/\s+/);
  if (parts.length >= 2) {
    const [from, to] = parts;
    if (from === to) return { type: "same", from, to };
    return { type: "local", from, to };
  }
  return { type: "local", from: parts[0], to: "HEAD" };
}
async function fetchLocalGitDiff(workingDir, from, to) {
  const { stdout } = await execFileAsync(
    "git",
    ["diff", `${from}..${to}`, "--stat", "--patch", "-U3"],
    { cwd: workingDir, maxBuffer: 10 * 1024 * 1024 }
  );
  return stdout;
}
async function fetchLocalVsRemoteDiff(workingDir) {
  await execFileAsync("git", ["fetch"], { cwd: workingDir }).catch(() => {
  });
  let upstream = "";
  try {
    const { stdout: stdout2 } = await execFileAsync(
      "git",
      ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"],
      { cwd: workingDir }
    );
    upstream = stdout2.trim();
  } catch {
    try {
      const { stdout: stdout2 } = await execFileAsync(
        "git",
        ["remote", "show", "-n", "origin"],
        { cwd: workingDir }
      );
      const m = stdout2.match(/HEAD branch: (.+)/);
      upstream = m ? `origin/${m[1].trim()}` : "origin/main";
    } catch {
      upstream = "origin/main";
    }
  }
  const { stdout } = await execFileAsync(
    "git",
    ["diff", `${upstream}..HEAD`, "--stat", "--patch", "-U3"],
    { cwd: workingDir, maxBuffer: 10 * 1024 * 1024 }
  );
  return { diff: stdout, description: `local HEAD vs ${upstream}` };
}
async function fetchGitHubDiff(owner, repo, from, to) {
  const token = process.env.GITHUB_TOKEN;
  const headers = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "CodeReviewAgent/1.0"
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const url = `https://api.github.com/repos/${owner}/${repo}/compare/${from}...${to}`;
  const resp = await fetch(url, { headers });
  if (!resp.ok) {
    const hint = resp.status === 404 ? " (repo not found or private \u2014 set GITHUB_TOKEN env var)" : "";
    throw new Error(`GitHub API ${resp.status}: ${resp.statusText}${hint}`);
  }
  const data = await resp.json();
  const files = data.files ?? [];
  let diff = `# GitHub: ${owner}/${repo}  ${from}...${to}  (${files.length} files, ${data.ahead_by ?? "?"} commits ahead)

`;
  for (const f of files) {
    diff += `--- a/${f.filename}
+++ b/${f.filename}
# ${f.status}  +${f.additions} -${f.deletions}
`;
    if (f.patch) diff += f.patch + "\n\n";
  }
  return diff;
}
async function fetchGitLabDiff(host, projectPath, from, to) {
  const token = process.env.GITLAB_TOKEN;
  const headers = { "Content-Type": "application/json" };
  if (token) headers["PRIVATE-TOKEN"] = token;
  const encodedPath = encodeURIComponent(projectPath);
  const url = `https://${host}/api/v4/projects/${encodedPath}/repository/compare?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
  const resp = await fetch(url, { headers });
  if (!resp.ok) {
    const hint = resp.status === 401 || resp.status === 404 ? " \u2014 set GITLAB_TOKEN env var" : "";
    throw new Error(`GitLab API ${resp.status}: ${resp.statusText}${hint}`);
  }
  const data = await resp.json();
  const diffs = data.diffs ?? [];
  const commits = data.commits ?? [];
  let diff = `# GitLab: ${projectPath}  ${from}...${to}  (${commits.length} commits, ${diffs.length} files)

`;
  for (const d of diffs) {
    const status = d.new_file ? "added" : d.deleted_file ? "deleted" : d.renamed_file ? "renamed" : "modified";
    diff += `--- a/${d.old_path}
+++ b/${d.new_path}
# ${status}
`;
    if (d.diff) diff += d.diff + "\n\n";
  }
  return diff;
}
async function fetchDiff(args, workingDir) {
  switch (args.type) {
    case "remote":
      return fetchLocalVsRemoteDiff(workingDir);
    case "github": {
      const diff = await fetchGitHubDiff(
        args.owner,
        args.repo,
        args.from,
        args.to
      );
      return {
        diff,
        description: `${args.owner}/${args.repo} ${args.from}...${args.to}`
      };
    }
    case "gitlab": {
      const diff = await fetchGitLabDiff(
        args.host,
        args.projectPath,
        args.from,
        args.to
      );
      return {
        diff,
        description: `${args.projectPath} ${args.from}...${args.to}`
      };
    }
    default: {
      const diff = await fetchLocalGitDiff(
        workingDir,
        args.from,
        args.to
      );
      return { diff, description: `${args.from}..${args.to}` };
    }
  }
}
var execFileAsync;
var init_diff_fetcher = __esm({
  "src/diff-fetcher.ts"() {
    "use strict";
    execFileAsync = promisify(execFile);
  }
});

// src/diff-reviewer.ts
function buildDiffPrompts(diff, description, dimensions) {
  const diffForReview = diff.length > 5e4 ? diff.slice(0, 5e4) + "\n\n... [diff truncated \u2014 too large] ..." : diff;
  return dimensions.filter((d) => DIMS[d]).map((dimKey) => {
    const meta = DIMS[dimKey];
    return {
      dimension: dimKey,
      displayName: meta.displayName,
      weight: meta.weight,
      systemPrompt: `${meta.systemPrompt}

${JSON_FORMAT}`,
      userPrompt: `Review this git diff for ${meta.displayName} issues.
Context: ${description}

\`\`\`diff
${diffForReview}
\`\`\``
    };
  });
}
function buildPlaceholderResult(dimensions) {
  const dimResults = dimensions.filter((d) => DIMS[d]).map((dimKey) => ({
    dimension: dimKey,
    displayName: DIMS[dimKey].displayName,
    score: 0,
    weight: DIMS[dimKey].weight,
    summary: "Pending IDE review",
    findings: []
  }));
  return {
    dimensions: dimResults,
    compositeScore: 0,
    grade: "N/A"
  };
}
async function reviewDiff(diff, description, _apiKey, dimensions, options = {}) {
  options.onProgress?.("Generating prompts for IDE review...");
  const prompts = buildDiffPrompts(diff, description, dimensions);
  console.log(`
${"=".repeat(80)}`);
  console.log(`Diff Review Prompts \u2014 ${description}`);
  console.log(`${"=".repeat(80)}
`);
  console.log(`Copy each prompt into your IDE's chat (GitHub Copilot, Claude, etc.):
`);
  for (const p of prompts) {
    console.log(`
${"\u2500".repeat(80)}`);
    console.log(`## ${p.displayName} (weight: ${(p.weight * 100).toFixed(0)}%)`);
    console.log(`${"\u2500".repeat(80)}
`);
    console.log(`**System:** ${p.systemPrompt}
`);
    console.log(`**User prompt:**
${p.userPrompt}`);
  }
  console.log(`
${"=".repeat(80)}`);
  console.log(`TIP: Register the MCP server in your IDE for seamless review:`);
  console.log(`  @codeReviewBuddy /diff \u2014 reviews your last commit automatically`);
  console.log(`${"=".repeat(80)}
`);
  return buildPlaceholderResult(dimensions);
}
var DIMS, JSON_FORMAT;
var init_diff_reviewer = __esm({
  "src/diff-reviewer.ts"() {
    "use strict";
    DIMS = {
      security: {
        displayName: "Security",
        weight: 0.2,
        systemPrompt: "You are a security reviewer. Focus ONLY on new/changed code in the diff. Check auth bypasses, XSS, injection, secrets, CORS, IDOR. Cite CWE IDs."
      },
      vulnerabilities: {
        displayName: "Vulnerabilities",
        weight: 0.15,
        systemPrompt: "You are a vulnerability researcher. Focus ONLY on changed code. Check prototype pollution, ReDoS, SSRF, timing attacks, mass assignment."
      },
      critical_blockers: {
        displayName: "Critical Blockers",
        weight: 0.2,
        systemPrompt: "Focus ONLY on changed code. Check for unimplemented critical paths, crash risks, data integrity issues, missing transactions."
      },
      test_coverage: {
        displayName: "Test Coverage",
        weight: 0.15,
        systemPrompt: "Review the diff for missing tests covering the new/changed functionality. Check if changes include corresponding test updates."
      },
      tech_debt: {
        displayName: "Tech Debt",
        weight: 0.1,
        systemPrompt: "Review the diff for TODOs, dead code, deprecated APIs, duplication introduced in these changes."
      },
      complexity: {
        displayName: "Complexity",
        weight: 0.1,
        systemPrompt: "Review the diff for added complexity: cyclomatic complexity >10, functions >50 lines, deep nesting, boolean trap parameters."
      },
      naming_conventions: {
        displayName: "Naming",
        weight: 0.1,
        systemPrompt: "Review the diff for naming issues in new/changed code: wrong case, vague names, inconsistency."
      }
    };
    JSON_FORMAT = `Return JSON:
\`\`\`json
{"score":<0-10>,"summary":"<assessment>","findings":[{"severity":"<CRITICAL|HIGH|MEDIUM|LOW>","title":"<title>","description":"<desc>","file_path":"<file or null>","line":<n|null>,"suggestion":"<fix>","cwe_id":"<CWE or null>"}]}
\`\`\`

Score the quality of the CHANGED code only.`;
  }
});

// src/project-reviewer.ts
import { readFile as readFile3, readdir as readdir2, stat } from "fs/promises";
import { join as join3, extname as extname2, relative } from "path";
async function collectSourceFiles(root) {
  const files = [];
  async function walk(dir) {
    const entries = await readdir2(dir).catch(() => []);
    for (const name of entries) {
      if (SKIP_DIRS.has(name) || name.startsWith(".")) continue;
      const full = join3(dir, name);
      const s = await stat(full).catch(() => null);
      if (!s) continue;
      if (s.isDirectory()) await walk(full);
      else if (SOURCE_EXTS.has(extname2(name).toLowerCase()) && s.size < 500 * 1024)
        files.push(full);
    }
  }
  await walk(root);
  return files;
}
async function detectStack(root, files) {
  const layers = [];
  const hasTsx = files.some((f) => f.endsWith(".tsx"));
  const hasJsx = files.some((f) => f.endsWith(".jsx"));
  const hasPy = files.some((f) => f.endsWith(".py"));
  const hasGo = files.some((f) => f.endsWith(".go"));
  const hasJava = files.some((f) => f.endsWith(".java"));
  try {
    const pkg = JSON.parse(await readFile3(join3(root, "package.json"), "utf-8"));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    if (deps["react-native"] || deps["expo"]) layers.push("Mobile (React Native)");
    else if (deps["react"] || hasTsx || hasJsx) layers.push("Frontend (React)");
    if (deps["express"] || deps["fastify"] || deps["koa"]) layers.push("Backend (Node.js)");
    if (deps["next"]) layers.push("Full-stack (Next.js)");
  } catch {
  }
  if (hasPy) layers.push("Backend (Python)");
  if (hasGo) layers.push("Backend (Go)");
  if (hasJava) layers.push("Backend (Java)");
  return layers.length > 0 ? layers.join(" + ") : "Mixed/Unknown";
}
async function reviewProject(projectRoot, _apiKey, dimensions, options = {}) {
  options.onProgress?.("Scanning project files...");
  const allFiles = await collectSourceFiles(projectRoot);
  const stackInfo = await detectStack(projectRoot, allFiles);
  options.onProgress?.(
    `Found ${allFiles.length} source files (${stackInfo}). Building prompts...`
  );
  let bundle = "";
  let bundleSize = 0;
  const MAX_BUNDLE = 80 * 1024;
  for (const file of allFiles) {
    if (bundleSize >= MAX_BUNDLE) break;
    const content = await readFile3(file, "utf-8").catch(() => "");
    const relPath = relative(projectRoot, file);
    const entry = `

// \u2500\u2500\u2500 ${relPath} \u2500\u2500\u2500
${content}`;
    bundle += entry;
    bundleSize += entry.length;
  }
  if (bundleSize >= MAX_BUNDLE) {
    bundle += "\n\n// ... [bundle truncated \u2014 remaining files omitted]";
  }
  const header = `Project: ${projectRoot}
Stack: ${stackInfo}
Files: ${allFiles.length}
`;
  console.log(`
${"=".repeat(80)}`);
  console.log(`Project Review Prompts \u2014 ${projectRoot}`);
  console.log(`Stack: ${stackInfo} | Files: ${allFiles.length}`);
  console.log(`${"=".repeat(80)}
`);
  console.log(`Copy each prompt into your IDE's chat (GitHub Copilot, Claude, etc.):
`);
  const dimResults = [];
  for (const dimKey of dimensions) {
    const meta = DIMS2[dimKey];
    if (!meta) continue;
    const systemPrompt = `${meta.systemPrompt}

You are reviewing the ENTIRE project.
${header}
${JSON_FORMAT2}`;
    const userPrompt = options.context ? `Review the project for ${meta.displayName} issues.

Context:
${options.context}

Source files:
\`\`\`
${bundle}
\`\`\`` : `Review the project for ${meta.displayName} issues.

Source files:
\`\`\`
${bundle}
\`\`\``;
    console.log(`
${"\u2500".repeat(80)}`);
    console.log(`## ${meta.displayName} (weight: ${(meta.weight * 100).toFixed(0)}%)`);
    console.log(`${"\u2500".repeat(80)}
`);
    console.log(`**System:** ${systemPrompt}
`);
    console.log(`**User prompt:**
${userPrompt}`);
    dimResults.push({
      dimension: dimKey,
      displayName: meta.displayName,
      score: 0,
      weight: meta.weight,
      summary: "Pending IDE review",
      findings: []
    });
  }
  console.log(`
${"=".repeat(80)}`);
  console.log(`TIP: Register the MCP server in your IDE for seamless review:`);
  console.log(`  @codeReviewBuddy /project ${projectRoot}`);
  console.log(`${"=".repeat(80)}
`);
  return {
    dimensions: dimResults,
    compositeScore: 0,
    grade: "N/A",
    stackInfo,
    fileCount: allFiles.length
  };
}
var SKIP_DIRS, SOURCE_EXTS, DIMS2, JSON_FORMAT2;
var init_project_reviewer = __esm({
  "src/project-reviewer.ts"() {
    "use strict";
    SKIP_DIRS = /* @__PURE__ */ new Set([
      "node_modules",
      ".git",
      "__pycache__",
      ".next",
      "dist",
      "build",
      "coverage",
      ".venv",
      "venv",
      ".expo",
      "out",
      ".turbo",
      ".cache"
    ]);
    SOURCE_EXTS = /* @__PURE__ */ new Set([
      ".ts",
      ".tsx",
      ".js",
      ".jsx",
      ".py",
      ".java",
      ".kt",
      ".go",
      ".rb",
      ".cs",
      ".php",
      ".swift",
      ".rs"
    ]);
    DIMS2 = {
      security: {
        displayName: "Security",
        weight: 0.2,
        systemPrompt: "You are a security reviewer. Check for auth bypasses, XSS, injection, secrets, CORS, IDOR. Cite CWE IDs."
      },
      vulnerabilities: {
        displayName: "Vulnerabilities",
        weight: 0.15,
        systemPrompt: "You are a vulnerability researcher. Check for prototype pollution, ReDoS, SSRF, timing attacks, mass assignment."
      },
      critical_blockers: {
        displayName: "Critical Blockers",
        weight: 0.2,
        systemPrompt: "Check for unimplemented critical paths, crash risks, data integrity issues, missing transactions."
      },
      test_coverage: {
        displayName: "Test Coverage",
        weight: 0.15,
        systemPrompt: "Check for missing test files, untested critical paths, no edge cases, poor assertion quality."
      },
      tech_debt: {
        displayName: "Tech Debt",
        weight: 0.1,
        systemPrompt: "Check for TODO/FIXMEs, dead code, deprecated APIs, copy-paste duplication, magic numbers."
      },
      complexity: {
        displayName: "Complexity",
        weight: 0.1,
        systemPrompt: "Check for cyclomatic complexity >10, functions >50 lines, deep nesting, boolean trap parameters."
      },
      naming_conventions: {
        displayName: "Naming",
        weight: 0.1,
        systemPrompt: "Check for wrong case conventions, vague names, inconsistency, misleading names."
      }
    };
    JSON_FORMAT2 = `Return JSON:
\`\`\`json
{"score":<0-10>,"summary":"<assessment>","findings":[{"severity":"<CRITICAL|HIGH|MEDIUM|LOW>","title":"<title>","description":"<desc>","file_path":"<path>","line":<n|null>,"suggestion":"<fix>","cwe_id":"<CWE or null>"}]}
\`\`\``;
  }
});

// src/cli.ts
import { readFile as readFile4 } from "fs/promises";
import { resolve as resolve2 } from "path";
var require_cli = __commonJS({
  "src/cli.ts"() {
    init_prompt_builder();
    init_html_reporter();
    init_diff_fetcher();
    init_diff_reviewer();
    init_project_reviewer();
    function parseArgs() {
      const args = process.argv.slice(2);
      const parsed = { helpRequested: false, hasDiff: false };
      for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === "--help" || arg === "-h") {
          parsed.helpRequested = true;
        } else if (arg === "--file" || arg === "-f") {
          parsed.filePath = args[++i];
        } else if (arg === "--project") {
          parsed.projectPath = args[i + 1] && !args[i + 1].startsWith("--") ? args[++i] : process.cwd();
        } else if (arg === "--diff") {
          parsed.hasDiff = true;
          const parts = [];
          while (args[i + 1] && !args[i + 1].startsWith("--")) {
            parts.push(args[++i]);
          }
          parsed.diffArg = parts.join(" ");
        } else if (arg === "--format" || arg === "-o") {
          parsed.format = args[++i];
        } else if (arg === "--report") {
          parsed.report = args[++i];
        } else if (arg === "--result") {
          parsed.result = args[++i];
        } else if (arg === "--dimensions") {
          parsed.dimensions = args[++i];
        } else if (arg === "--api-key") {
          i++;
        } else if (arg === "--jira") {
          parsed.jira = args[++i];
        } else if (arg === "--brs") {
          parsed.brs = args[++i];
        } else if (arg === "--architecture") {
          parsed.architecture = args[++i];
        } else if (arg === "--figma") {
          parsed.figma = args[++i];
        }
      }
      return parsed;
    }
    function showHelp() {
      console.log(`
Universal Code Review Agent
AI-powered code review using your IDE's built-in LLM \u2014 no API key required

USAGE:
  code-review-agent --file <path>               Review a single file (generates prompts)
  code-review-agent --project [path]            Review entire project (generates prompts)
  code-review-agent --diff [ref|url]            Review code diff (generates prompts)
  code-review-agent --report <project-path>     Generate HTML from prompt files

DIFF MODES (--diff):
  --diff                         Last 2 commits (HEAD~1..HEAD)
  --diff remote                  Local HEAD vs upstream tracking branch
  --diff v1.2.3                  v1.2.3 vs HEAD
  --diff v1.0 v1.2               Between two refs
  --diff <github-compare-url>    Fetch diff via GitHub API
  --diff <gitlab-compare-url>    Fetch diff via GitLab API

OPTIONS:
  --file, -f <path>              Path to code file to review
  --project [path]               Project directory (defaults to current directory)
  --dimensions <list>            Comma-separated dimensions to review
                                 (security,vulnerabilities,critical_blockers,
                                  test_coverage,tech_debt,complexity,naming_conventions)
  --format, -o <format>          Output: json | markdown | console | prompts | html
  --report <path>                Generate HTML from prompt files in directory
  --result <path>                JSON result file (used with --format html)
  --jira <path>                  Path to Jira ticket
  --brs <path>                   Path to BRS document
  --architecture <path>          Path to architecture document
  --figma <path>                 Path to Figma export
  --help, -h                     Show this help

ENVIRONMENT VARIABLES:
  GITHUB_TOKEN                   Optional \u2014 for private GitHub repos
  GITLAB_TOKEN                   Required for GitLab diffs

IDE INTEGRATION (recommended):
  Register the MCP server in VS Code and use @codeReviewBuddy in chat:
    "mcp": { "servers": { "code-review": { "command": "node", "args": ["<mcp-server/dist/index.js>"] } } }

EXAMPLES:
  # Review a file (generates prompts for manual IDE entry)
  code-review-agent --file src/auth.ts

  # Review entire project (generates prompts)
  code-review-agent --project D:/MyApp

  # Review last 2 commits (generates prompts)
  code-review-agent --diff

  # Review from GitHub compare URL
  code-review-agent --diff "https://github.com/owner/repo/compare/v1...v2"

  # Review only security dimensions
  code-review-agent --project . --dimensions security,vulnerabilities
`);
    }
    var ALL_DIMENSIONS2 = [
      "security",
      "vulnerabilities",
      "critical_blockers",
      "test_coverage",
      "tech_debt",
      "complexity",
      "naming_conventions"
    ];
    function getDimensions(raw) {
      if (!raw) return ALL_DIMENSIONS2;
      return raw.split(",").map((d) => d.trim());
    }
    async function main() {
      const parsed = parseArgs();
      if (parsed.helpRequested) {
        showHelp();
        process.exit(0);
      }
      if (parsed.report) {
        try {
          console.error(`
\u{1F4CA} Generating HTML report from: ${parsed.report}`);
          const reportPath = await saveHTMLReport(resolve2(parsed.report));
          console.error(`
\u2705 Report: ${reportPath}`);
          process.exit(0);
        } catch (err) {
          console.error("\u274C Error:", err instanceof Error ? err.message : String(err));
          process.exit(1);
        }
      }
      if (parsed.hasDiff) {
        const dimensions = getDimensions(parsed.dimensions);
        const diffArgs = parseDiffArgs(parsed.diffArg ?? "");
        if (diffArgs.type === "same") {
          console.error(
            `
\u26A0\uFE0F  Both versions are the same (${diffArgs.from}). Running project review instead...
`
          );
          const root = resolve2(process.cwd());
          await reviewProject(root, "", dimensions, {
            onProgress: (msg) => console.error(`  \u27F3  ${msg}`)
          });
          process.exit(0);
        }
        console.error(
          `
\u{1F50D} Fetching diff: ${parsed.diffArg || "(last 2 commits)"} ...`
        );
        let diffResult;
        try {
          diffResult = await fetchDiff(diffArgs, process.cwd());
        } catch (err) {
          console.error("\u274C Error fetching diff:", err instanceof Error ? err.message : String(err));
          process.exit(1);
        }
        if (!diffResult.diff.trim()) {
          console.error("\n\u2705 No changes found between the specified versions.");
          process.exit(0);
        }
        const diffLines = diffResult.diff.split("\n").length;
        console.error(`
\u{1F4C4} Diff: ${diffLines} lines \u2014 ${diffResult.description}`);
        await reviewDiff(diffResult.diff, diffResult.description, "", dimensions, {
          onProgress: (msg) => console.error(`  \u27F3  ${msg}`)
        });
        process.exit(0);
      }
      if (parsed.projectPath) {
        const root = resolve2(parsed.projectPath);
        const dimensions = getDimensions(parsed.dimensions);
        console.error(`
\u{1F5C2}\uFE0F  Reviewing project: ${root}`);
        const result = await reviewProject(root, "", dimensions, {
          onProgress: (msg) => console.error(`  \u27F3  ${msg}`)
        }).catch((err) => {
          console.error("\u274C Error:", err instanceof Error ? err.message : String(err));
          process.exit(1);
        });
        if (parsed.format === "html") {
          const outPath = resolve2(root, "code-review-project-report.html");
          await saveHTMLFromResult(result, outPath, root);
          console.error(`
\u2705 HTML report: ${outPath}`);
        } else if (parsed.format === "json") {
          console.log(JSON.stringify(result, null, 2));
        }
        process.exit(0);
      }
      if (parsed.filePath) {
        const format = parsed.format || "prompts";
        if (format === "html") {
          if (!parsed.result) {
            console.error(
              "\n\u274C --format html requires --result <path-to-review.json>\n"
            );
            process.exit(1);
          }
          const jsonText = await readFile4(resolve2(parsed.result), "utf-8");
          const reviewData = JSON.parse(jsonText);
          const r = {
            dimensions: reviewData.dimensions ?? [],
            compositeScore: reviewData.score?.composite ?? reviewData.compositeScore ?? 5,
            grade: reviewData.score?.grade ?? reviewData.grade ?? "C"
          };
          const outPath = resolve2(parsed.filePath.replace(/\.[^.]+$/, "") + "-review.html");
          await saveHTMLFromResult(r, outPath, parsed.filePath);
          console.error(`
\u2705 HTML report: ${outPath}`);
          process.exit(0);
        }
        console.error(`
\u{1F4C4} Reading file: ${parsed.filePath}`);
        const code = await readFile4(resolve2(parsed.filePath), "utf-8").catch((err) => {
          console.error("\u274C Error reading file:", err.message);
          process.exit(1);
        });
        const request = {
          code,
          filePath: parsed.filePath,
          businessContext: {
            jiraPath: parsed.jira,
            brsPath: parsed.brs,
            architecturePath: parsed.architecture,
            figmaPath: parsed.figma
          }
        };
        console.error(`
\u{1F504} Generating review prompts...
`);
        const result = await generateReviewPrompts(request);
        console.log(`
${"=".repeat(80)}`);
        console.log(`Universal Code Review \u2014 Manual IDE Entry Mode`);
        console.log(`${"=".repeat(80)}
`);
        for (const prompt of result.prompts) {
          console.log(formatPromptForManualEntry(prompt));
        }
        console.log(`
${"=".repeat(80)}`);
        console.log(`NEXT STEPS:`);
        console.log(`1. Copy each prompt into your IDE's chat`);
        console.log(`2. Save the JSON response and run with --format html --result <file>`);
        console.log(`${"=".repeat(80)}
`);
        process.exit(0);
      }
      showHelp();
      process.exit(1);
    }
    main().catch((err) => {
      console.error("\u274C Fatal:", err instanceof Error ? err.message : String(err));
      process.exit(1);
    });
  }
});
export default require_cli();
