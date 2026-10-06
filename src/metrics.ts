/**
 * TaskFlow Metrics Collector
 * Implementação inicial parcial por Worker 1 (Antigravity Alpha)
 */

export interface SystemHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  memoryUsageMb: number;
  uptimeSeconds: number;
}

export interface ThroughputStats {
  totalRequests: number;
  requestsPerMinute: number;
}

export class MetricsCollector {
  private startTime = Date.now();
  private requestLog: Array<{ route: string; durationMs: number; timestamp: number }> = [];

  recordRequest(route: string, durationMs: number): void {
    this.requestLog.push({ route, durationMs, timestamp: Date.now() });
  }

  getAverageLatency(route?: string): number {
    const filtered = route ? this.requestLog.filter(r => r.route === route) : this.requestLog;
    if (filtered.length === 0) return 0;
    const total = filtered.reduce((acc, curr) => acc + curr.durationMs, 0);
    return Math.round((total / filtered.length) * 100) / 100;
  }

  // TODO: Worker 1 não terminou getThroughput e getSystemHealth
  // TODO: Worker 1 não implementou tests/metrics.test.ts
}
