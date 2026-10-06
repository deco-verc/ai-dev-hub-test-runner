import { describe, it } from 'node:test';
import assert from 'node:assert';
import { MetricsCollector } from '../src/metrics.js';

describe('TaskFlow Metrics Collector (Worker 2 Beta Tests)', () => {
  it('deve registrar requests e calcular latência média global', () => {
    const collector = new MetricsCollector();
    collector.recordRequest('/tasks', 100);
    collector.recordRequest('/tasks', 200);

    const avg = collector.getAverageLatency();
    assert.strictEqual(avg, 150);
  });

  it('deve calcular latência filtrada por rota específica', () => {
    const collector = new MetricsCollector();
    collector.recordRequest('/tasks', 50);
    collector.recordRequest('/health', 10);
    collector.recordRequest('/tasks', 70);

    const tasksAvg = collector.getAverageLatency('/tasks');
    const healthAvg = collector.getAverageLatency('/health');

    assert.strictEqual(tasksAvg, 60);
    assert.strictEqual(healthAvg, 10);
  });

  it('deve retornar 0 para rota sem registros', () => {
    const collector = new MetricsCollector();
    assert.strictEqual(collector.getAverageLatency('/unknown'), 0);
  });

  it('deve calcular throughput e contagem total', () => {
    const collector = new MetricsCollector();
    collector.recordRequest('/tasks', 50);
    collector.recordRequest('/tasks', 60);
    collector.recordRequest('/tasks', 70);

    const throughput = collector.getThroughput();
    assert.strictEqual(throughput.totalRequests, 3);
    assert.ok(throughput.requestsPerMinute > 0);
  });

  it('deve retornar métricas de system health válidas', () => {
    const collector = new MetricsCollector();
    const health = collector.getSystemHealth();

    assert.ok(['healthy', 'degraded', 'unhealthy'].includes(health.status));
    assert.ok(health.memoryUsageMb > 0);
    assert.ok(health.uptimeSeconds >= 0);
  });

  it('deve resetar métricas acumuladas com sucesso', () => {
    const collector = new MetricsCollector();
    collector.recordRequest('/tasks', 100);
    assert.strictEqual(collector.getAverageLatency(), 100);

    collector.reset();
    assert.strictEqual(collector.getAverageLatency(), 0);
    assert.strictEqual(collector.getThroughput().totalRequests, 0);
  });
});
