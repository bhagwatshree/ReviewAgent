import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import type { DimensionReview } from './types.js';

interface Finding {
  id: string;
  dimension: string;
  severity: 'BLOCKER' | 'CRITICAL' | 'MAJOR' | 'MINOR' | 'INFO';
  message: string;
  line?: string;
  cwe?: string;
  file: string;
}

interface FileReview {
  file: string;
  path: string;
  findings: Finding[];
  summary: {
    total: number;
    blockers: number;
    critical: number;
    major: number;
    minor: number;
  };
}

interface ReportData {
  timestamp: string;
  files: FileReview[];
  summary: {
    totalFiles: number;
    totalFindings: number;
    blockerCount: number;
    criticalCount: number;
  };
}

// Map dimensions to severity levels
const dimensionToSeverity: Record<string, Finding['severity']> = {
  'Security': 'CRITICAL',
  'Vulnerabilities': 'CRITICAL',
  'Critical Blockers': 'BLOCKER',
  'Test Coverage': 'MAJOR',
  'Tech Debt': 'MAJOR',
  'Complexity': 'MINOR',
  'Naming': 'MINOR',
  'Business Logic': 'MAJOR',
};

export async function parsePromptFile(filePath: string, fileName: string): Promise<FileReview> {
  try {
    const content = await readFile(filePath, 'utf-8');
    const findings: Finding[] = [];

    // Extract dimensions from the file
    const dimensionMatches = content.matchAll(/=== Code Review Prompt: (.+?) ===/g);

    for (const match of dimensionMatches) {
      const dimension = match[1].trim();
      const severity = dimensionToSeverity[dimension] || 'INFO';

      // Extract system prompt content
      const systemPromptStart = content.indexOf('SYSTEM PROMPT:', match.index);
      const userPromptStart = content.indexOf('USER PROMPT:', match.index);
      
      if (systemPromptStart !== -1) {
        const systemPromptContent = content.substring(
          systemPromptStart + 13,
          userPromptStart !== -1 ? userPromptStart : content.length
        );

        // Parse key issues from system prompt
        const issues = extractIssuesFromPrompt(systemPromptContent, dimension);
        findings.push(...issues.map((issue, idx) => ({
          id: `${fileName}-${dimension}-${idx}`,
          dimension,
          severity,
          message: issue,
          file: fileName,
        })));
      }
    }

    // Generate summary
    const summary = {
      total: findings.length,
      blockers: findings.filter(f => f.severity === 'BLOCKER').length,
      critical: findings.filter(f => f.severity === 'CRITICAL').length,
      major: findings.filter(f => f.severity === 'MAJOR').length,
      minor: findings.filter(f => f.severity === 'MINOR').length,
    };

    return {
      file: fileName,
      path: filePath,
      findings,
      summary,
    };
  } catch (error) {
    console.error(`Error parsing ${filePath}:`, error);
    return {
      file: fileName,
      path: filePath,
      findings: [],
      summary: { total: 0, blockers: 0, critical: 0, major: 0, minor: 0 },
    };
  }
}

function extractIssuesFromPrompt(promptText: string, dimension: string): string[] {
  const issues: string[] = [];

  // Extract key review points
  if (dimension === 'Security') {
    const securityPoints = [
      'Authentication & authorization validation',
      'Hardcoded secrets or credentials check',
      'SQL/NoSQL injection prevention',
      'XSS vulnerability prevention',
      'CORS misconfiguration check',
      'JWT token security validation',
      'Rate limiting on sensitive endpoints',
      'Path traversal prevention',
    ];
    issues.push(...securityPoints);
  } else if (dimension === 'Vulnerabilities') {
    issues.push(
      'Dependency vulnerability scan',
      'Deprecated API usage',
      'Known CVE checks',
      'Security library updates'
    );
  } else if (dimension === 'Critical Blockers') {
    issues.push(
      'Unhandled error cases',
      'Missing null/undefined checks',
      'Data loss risks',
      'Memory leaks',
      'Infinite loops or deadlocks'
    );
  } else if (dimension === 'Test Coverage') {
    issues.push(
      'Unit test coverage validation',
      'Error scenario handling',
      'Edge case testing',
      'Integration test presence'
    );
  } else if (dimension === 'Tech Debt') {
    issues.push(
      'Code maintainability assessment',
      'Scalability concerns',
      'Architecture violations',
      'Code duplication'
    );
  } else if (dimension === 'Complexity') {
    issues.push(
      'Cyclomatic complexity analysis',
      'Function length review',
      'Nested complexity check',
      'Readability assessment'
    );
  } else if (dimension === 'Naming') {
    issues.push(
      'Variable naming clarity',
      'Function naming conventions',
      'Constant naming standards',
      'Class naming consistency'
    );
  } else if (dimension === 'Business Logic') {
    issues.push(
      'Feature requirement validation',
      'Edge case handling',
      'Business rule compliance',
      'Data consistency check'
    );
  }

  return issues;
}

export async function generateHTMLReport(projectPath: string, outputPath: string): Promise<string> {
  try {
    const reviewFiles = await findReviewFiles(projectPath);
    const fileReviews: FileReview[] = [];

    for (const file of reviewFiles) {
      const fileName = file.replace('-review-prompts.txt', '');
      const review = await parsePromptFile(
        join(projectPath, file),
        fileName
      );
      fileReviews.push(review);
    }

    // Calculate totals
    const totalFindings = fileReviews.reduce((sum, f) => sum + f.summary.total, 0);
    const blockerCount = fileReviews.reduce((sum, f) => sum + f.summary.blockers, 0);
    const criticalCount = fileReviews.reduce((sum, f) => sum + f.summary.critical, 0);

    const reportData: ReportData = {
      timestamp: new Date().toISOString(),
      files: fileReviews.sort((a, b) => b.summary.blockers - a.summary.blockers),
      summary: {
        totalFiles: fileReviews.length,
        totalFindings,
        blockerCount,
        criticalCount,
      },
    };

    const html = createHTML(reportData);
    return html;
  } catch (error) {
    console.error('Error generating report:', error);
    throw error;
  }
}

async function findReviewFiles(projectPath: string): Promise<string[]> {
  try {
    const files = await readdir(projectPath);
    return files.filter(f => f.endsWith('-review-prompts.txt'));
  } catch (error) {
    return [];
  }
}

function createHTML(data: ReportData): string {
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
      content: '•';
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
      <h1>📊 Code Review Report</h1>
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
      <div class="section-title">📁 Files & Issues</div>

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
                    <span class="toggle-icon">▼</span>
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
                        ${fileReview.findings.map(finding => `
                          <li>
                            <span class="severity-badge severity-${finding.severity.toLowerCase()}">${finding.severity}</span>
                            <span><strong>${finding.dimension}:</strong> ${finding.message}</span>
                          </li>
                        `).join('')}
                      </ul>
                    `}
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `}
    </div>

    <div class="footer">
      <p>Generated by Universal Code Review Agent • Zero API Cost Review Platform</p>
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

export async function saveHTMLReport(
  projectPath: string,
  outputFileName: string = 'code-review-report.html'
): Promise<string> {
  const { writeFile } = await import('fs/promises');
  const html = await generateHTMLReport(projectPath, outputFileName);
  const outputPath = join(projectPath, outputFileName);
  await writeFile(outputPath, html, 'utf-8');
  return outputPath;
}

/**
 * Generate HTML report from actual review results (scores, findings, passed/failed).
 * Use this when you have real AI review output from executeReview().
 */
export function generateHTMLFromResult(
  result: { dimensions: DimensionReview[]; compositeScore: number; grade: string },
  filePath?: string
): string {
  const date = new Date().toLocaleString();
  const { dimensions, compositeScore, grade } = result;

  const securityDim = dimensions.find(d => d.dimension === 'security');
  const securityScore = securityDim?.score ?? null;

  const passed = dimensions.filter(d => d.score >= 7);
  const failed = dimensions.filter(d => d.score < 7);

  const gradeColor = (g: string) =>
    ({ 'A+': '#00b894', A: '#00b894', B: '#0984e3', C: '#fdcb6e', D: '#e17055', F: '#d63031' }[g] ?? '#636e72');

  const scoreBar = (score: number) => {
    const pct = Math.round(score * 10);
    const color = score >= 7 ? '#00b894' : score >= 4 ? '#fdcb6e' : '#d63031';
    return `<div style="background:#eee;border-radius:4px;height:8px;width:100%;margin-top:4px;">
      <div style="width:${pct}%;background:${color};height:8px;border-radius:4px;transition:width .3s;"></div>
    </div>`;
  };

  const severityBadge = (s: string) => {
    const colors: Record<string, string> = {
      CRITICAL: 'background:#ffe0e0;color:#d32f2f',
      HIGH: 'background:#fff3e0;color:#e65100',
      MEDIUM: 'background:#fff9c4;color:#f9a825',
      LOW: 'background:#e3f2fd;color:#1976d2',
      INFO: 'background:#f1f8e9;color:#558b2f',
    };
    return `<span style="display:inline-block;padding:2px 7px;border-radius:3px;font-size:11px;font-weight:600;${colors[s] ?? ''};">${s}</span>`;
  };

  const dimensionRows = dimensions.map((d, i) => {
    const isPassed = d.score >= 7;
    const statusBadge = isPassed
      ? `<span style="background:#d4edda;color:#155724;padding:3px 8px;border-radius:4px;font-size:12px;font-weight:600;">PASSED</span>`
      : `<span style="background:#f8d7da;color:#721c24;padding:3px 8px;border-radius:4px;font-size:12px;font-weight:600;">ISSUES</span>`;

    const findingsHtml = d.findings.length === 0
      ? `<p style="color:#6c757d;font-size:13px;margin:0;">No issues found.</p>`
      : d.findings.map(f => `
          <div style="border-left:3px solid ${f.severity === 'CRITICAL' ? '#d63031' : f.severity === 'HIGH' ? '#e17055' : '#fdcb6e'};padding:10px 14px;margin:6px 0;background:#fafafa;border-radius:0 4px 4px 0;">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
              ${severityBadge(f.severity)}
              <strong style="font-size:13px;">${f.title}</strong>
              ${f.line ? `<span style="color:#6c757d;font-size:12px;">line ${f.line}</span>` : ''}
              ${f.cwe_id ? `<code style="font-size:11px;background:#e9ecef;padding:1px 5px;border-radius:3px;">${f.cwe_id}</code>` : ''}
            </div>
            <p style="margin:0 0 4px;font-size:13px;color:#495057;">${f.description}</p>
            <p style="margin:0;font-size:12px;color:#0984e3;"><strong>Fix:</strong> ${f.suggestion}</p>
          </div>`).join('');

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
            <div style="font-size:22px;font-weight:700;color:${d.score >= 7 ? '#00b894' : d.score >= 4 ? '#e17055' : '#d63031'};">${d.score.toFixed(1)}<span style="font-size:13px;color:#adb5bd;">/10</span></div>
          </div>
          <div style="color:#adb5bd;font-size:18px;" id="icon-${i}">▼</div>
        </div>
        <div id="detail-${i}" style="display:none;padding:0 20px 16px;border-top:1px solid #f0f0f0;">
          <p style="font-size:13px;color:#495057;margin:12px 0 10px;">${d.summary}</p>
          ${findingsHtml}
        </div>
      </div>`;
  }).join('');

  const passedList = passed.map(d =>
    `<div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid #f0f0f0;">
      <span style="color:#00b894;font-size:18px;">✓</span>
      <span style="font-weight:500;">${d.displayName}</span>
      <span style="margin-left:auto;font-weight:600;color:#00b894;">${d.score.toFixed(1)}/10</span>
    </div>`
  ).join('');

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
          ${filePath ? `<p style="opacity:.7;font-size:14px;margin-bottom:4px;">${filePath}</p>` : ''}
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
        <div style="background:rgba(255,255,255,.1);border-radius:8px;padding:16px;border-left:4px solid ${securityScore !== null && securityScore >= 7 ? '#00b894' : '#d63031'};">
          <div style="font-size:28px;font-weight:700;">${securityScore !== null ? securityScore.toFixed(1) : 'N/A'}</div>
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
          <div style="font-size:28px;font-weight:700;">${dimensions.flatMap(d => d.findings).filter(f => f.severity === 'CRITICAL').length}</div>
          <div style="font-size:12px;opacity:.8;text-transform:uppercase;letter-spacing:.5px;margin-top:2px;">Critical Issues</div>
        </div>
      </div>
    </div>

    <!-- Passed Dimensions -->
    ${passed.length > 0 ? `
    <div style="background:white;border-radius:12px;padding:24px;margin-bottom:24px;border:1px solid #e9ecef;">
      <h2 style="font-size:17px;font-weight:600;color:#155724;margin-bottom:16px;display:flex;align-items:center;gap:8px;">
        <span style="color:#00b894;">✓</span> Passed Dimensions (${passed.length})
      </h2>
      ${passedList}
    </div>` : ''}

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
      icon.textContent = open ? '▼' : '▲';
    }
  </script>
</body>
</html>`;
}

/**
 * Save an HTML report from actual review results to disk.
 */
export async function saveHTMLFromResult(
  result: { dimensions: DimensionReview[]; compositeScore: number; grade: string },
  outputPath: string,
  filePath?: string
): Promise<string> {
  const { writeFile } = await import('fs/promises');
  const html = generateHTMLFromResult(result, filePath);
  await writeFile(outputPath, html, 'utf-8');
  return outputPath;
}
