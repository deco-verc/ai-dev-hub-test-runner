/**
 * AI Dev Hub Test Runner
 * Entry point for autonomous end-to-end task validation.
 */

export * from './types.js';
export * from './validator.js';
export * from './store.js';

export interface TestRunnerConfig {
  projectName: string;
  version: string;
  logLevel?: 'info' | 'warn' | 'error' | 'debug';
}

export class TestRunner {
  private config: TestRunnerConfig;

  constructor(config: TestRunnerConfig) {
    this.config = config;
  }

  public run(): void {
    console.log(`[AI Dev Hub Test Runner] Initialized for ${this.config.projectName} v${this.config.version}`);
  }
}

export function createRunner(config?: Partial<TestRunnerConfig>): TestRunner {
  return new TestRunner({
    projectName: config?.projectName ?? 'ai-dev-hub-test-runner',
    version: config?.version ?? '1.0.0',
    logLevel: config?.logLevel ?? 'info'
  });
}
