import os from 'node:os';

/**
 * TaskFlow Metrics Collector
 * Finalizado por Worker 2 (Antigravity Beta) após handoff de Worker 1 (Alpha)
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

  getThroughput(): ThroughputStats {
    const totalRequests = this.requestLog.length;
    const elapsedMinutes = Math.max((Date.now() - this.startTime) / (60 * 1000), 1 / 60);
    const requestsPerMinute = Math.round((totalRequests / elapsedMinutes) * 100) / 100;
    return {
      totalRequests,
      requestsPerMinute
    };
  }

  getSystemHealth(): SystemHealth {
    const mem = process.memoryUsage();
    const memoryUsageMb = Math.round((mem.heapUsed / (1024 * 1024)) * 100) / 100;
    const uptimeSeconds = Math.round((Date.now() - this.startTime) / 1000);

    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    if (memoryUsageMb > 500) {
      status = 'unhealthy';
    } else if (memoryUsageMb > 250) {
      status = 'degraded';
    }

    return {
      status,
      memoryUsageMb,
      uptimeSeconds
    };
  }

  reset(): void {
    this.requestLog = [];
    this.startTime = Date.now();
  }
}
