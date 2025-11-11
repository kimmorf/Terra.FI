/**
 * Test Reporter
 * Gera relatórios de testes com reprodução passo-a-passo + tx_hash
 */

import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

export interface TestResult {
  testName: string;
  status: 'passed' | 'failed' | 'skipped';
  duration: number;
  txHashes: string[];
  error?: string;
  steps: TestStep[];
  metrics?: {
    latency?: number;
    retryCount?: number;
    engineResult?: string;
  };
}

export interface TestStep {
  step: string;
  action: string;
  txHash?: string;
  timestamp: string;
  result?: string;
  error?: string;
}

export class TestReporter {
  private results: TestResult[] = [];
  private reportDir: string;

  constructor(reportDir: string = './test-reports') {
    this.reportDir = reportDir;
  }

  async initialize(): Promise<void> {
    try {
      await mkdir(this.reportDir, { recursive: true });
    } catch (error) {
      // Directory may already exist
    }
  }

  addResult(result: TestResult): void {
    this.results.push(result);
  }

  async generateReport(): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const reportPath = join(this.reportDir, `test-report-${timestamp}.md`);

    const report = this.buildMarkdownReport();

    await writeFile(reportPath, report, 'utf-8');

    return reportPath;
  }

  private buildMarkdownReport(): string {
    const total = this.results.length;
    const passed = this.results.filter((r) => r.status === 'passed').length;
    const failed = this.results.filter((r) => r.status === 'failed').length;
    const skipped = this.results.filter((r) => r.status === 'skipped').length;

    let report = `# Test Report\n\n`;
    report += `**Generated:** ${new Date().toISOString()}\n\n`;
    report += `## Summary\n\n`;
    report += `- **Total:** ${total}\n`;
    report += `- **Passed:** ${passed} (${((passed / total) * 100).toFixed(1)}%)\n`;
    report += `- **Failed:** ${failed} (${((failed / total) * 100).toFixed(1)}%)\n`;
    report += `- **Skipped:** ${skipped}\n\n`;

    report += `## Test Results\n\n`;

    for (const result of this.results) {
      const statusEmoji = result.status === 'passed' ? '✅' : result.status === 'failed' ? '❌' : '⏭️';

      report += `### ${statusEmoji} ${result.testName}\n\n`;
      report += `**Status:** ${result.status}\n`;
      report += `**Duration:** ${result.duration}ms\n\n`;

      if (result.metrics) {
        report += `**Metrics:**\n`;
        if (result.metrics.latency) {
          report += `- Latency: ${result.metrics.latency}ms\n`;
        }
        if (result.metrics.retryCount !== undefined) {
          report += `- Retries: ${result.metrics.retryCount}\n`;
        }
        if (result.metrics.engineResult) {
          report += `- Engine Result: ${result.metrics.engineResult}\n`;
        }
        report += `\n`;
      }

      if (result.txHashes.length > 0) {
        report += `**Transaction Hashes:**\n`;
        for (const txHash of result.txHashes) {
          const explorerUrl = `https://testnet.xrpl.org/transactions/${txHash}`;
          report += `- [${txHash}](${explorerUrl})\n`;
        }
        report += `\n`;
      }

      if (result.steps.length > 0) {
        report += `**Steps:**\n\n`;
        for (const step of result.steps) {
          report += `1. **${step.step}** (${step.timestamp})\n`;
          report += `   - Action: ${step.action}\n`;
          if (step.txHash) {
            report += `   - TX Hash: [${step.txHash}](https://testnet.xrpl.org/transactions/${step.txHash})\n`;
          }
          if (step.result) {
            report += `   - Result: ${step.result}\n`;
          }
          if (step.error) {
            report += `   - ❌ Error: ${step.error}\n`;
          }
          report += `\n`;
        }
      }

      if (result.error) {
        report += `**Error:**\n\`\`\`\n${result.error}\n\`\`\`\n\n`;
      }

      report += `---\n\n`;
    }

    // Priorização de bugs
    const failedTests = this.results.filter((r) => r.status === 'failed');
    if (failedTests.length > 0) {
      report += `## Bug Priority List\n\n`;
      report += `| Test | Severity | Impact | TX Hash |\n`;
      report += `|------|----------|--------|----------|\n`;

      for (const test of failedTests) {
        const severity = this.determineSeverity(test);
        const impact = this.determineImpact(test);
        const txHash = test.txHashes[0] || 'N/A';

        report += `| ${test.testName} | ${severity} | ${impact} | ${txHash} |\n`;
      }
    }

    return report;
  }

  private determineSeverity(result: TestResult): string {
    if (result.error?.includes('CRITICAL') || result.error?.includes('atomic')) {
      return '🔴 CRITICAL';
    }
    if (result.error?.includes('authorization') || result.error?.includes('freeze')) {
      return '🟠 HIGH';
    }
    return '🟡 MEDIUM';
  }

  private determineImpact(result: TestResult): string {
    if (result.testName.includes('COL') || result.testName.includes('atomic')) {
      return 'Data consistency';
    }
    if (result.testName.includes('authorize')) {
      return 'User access';
    }
    return 'Feature functionality';
  }

  getResults(): TestResult[] {
    return this.results;
  }

  getPassRate(): number {
    if (this.results.length === 0) return 0;
    const passed = this.results.filter((r) => r.status === 'passed').length;
    return (passed / this.results.length) * 100;
  }
}
