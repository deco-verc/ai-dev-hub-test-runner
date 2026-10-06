import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as http from 'node:http';
import {
  validateTask,
  validateTaskEvent,
  Task,
  TaskEvent,
  createTaskStore,
  JsonTaskStore,
  createServer,
  ApiResponse,
  createRunner
} from '../index.js';

interface TestContext {
  suiteName: string;
  passed: number;
  failed: number;
}

const context: TestContext = {
  suiteName: '',
  passed: 0,
  failed: 0
};

function suite(name: string): void {
  context.suiteName = name;
  console.log(`\n=== [SUITE] ${name} ===`);
}

function assert(condition: boolean, description: string): void {
  if (condition) {
    console.log(`  ✓ PASS: ${description}`);
    context.passed++;
  } else {
    console.error(`  ✗ FAIL: ${description}`);
    context.failed++;
  }
}

function assertEqual<T>(actual: T, expected: T, description: string): void {
  const match = JSON.stringify(actual) === JSON.stringify(expected);
  if (match) {
    console.log(`  ✓ PASS: ${description}`);
    context.passed++;
  } else {
    console.error(`  ✗ FAIL: ${description} (Expected: ${JSON.stringify(expected)}, Got: ${JSON.stringify(actual)})`);
    context.failed++;
  }
}

function makeHttpRequest<T = unknown>(options: {
  port: number;
  path: string;
  method: string;
  body?: unknown;
}): Promise<{ status: number; body: ApiResponse<T> }> {
  return new Promise((resolve, reject) => {
    const payload = options.body ? JSON.stringify(options.body) : undefined;
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: options.port,
        path: options.path,
        method: options.method,
        headers: {
          'Content-Type': 'application/json',
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {})
        }
      },
      res => {
        let rawData = '';
        res.on('data', chunk => {
          rawData += chunk;
        });
        res.on('end', () => {
          try {
            const parsed = rawData ? JSON.parse(rawData) : {};
            resolve({ status: res.statusCode ?? 500, body: parsed });
          } catch (err) {
            reject(err);
          }
        });
      }
    );

    req.on('error', reject);
    if (payload) {
      req.write(payload);
    }
    req.end();
  });
}

export async function runAllTests(): Promise<{ passed: number; failed: number }> {
  const startTime = Date.now();
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║     AI Dev Hub Test Runner — QA & Test Automation Suite      ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  // ==========================================
  // SUITE 1: Unit Tests - Types & Validation
  // ==========================================
  suite('Unit: Types & Schemas Validation');

  const validTask: Task = {
    id: 'unit-task-1',
    title: 'Setup automated CI workflow',
    description: 'Configure GitHub Actions test pipeline',
    status: 'in_progress',
    priority: 'high',
    assignee: 'builder-agent',
    tags: ['ci', 'automation'],
    dependencies: ['unit-task-0'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    metadata: { env: 'testing', timeout: 3000 }
  };

  const valRes1 = validateTask(validTask);
  assert(valRes1.success === true, 'validateTask succeeds with compliant Task');
  assertEqual(valRes1.data?.id, 'unit-task-1', 'validateTask preserves id');
  assertEqual(valRes1.data?.priority, 'high', 'validateTask preserves priority');

  const invalidTaskInputs: unknown[] = [
    null,
    undefined,
    'not-an-object',
    { id: '', title: 'Title' },
    { id: '1', title: '' },
    { id: '1', title: 'T', status: 'not-a-valid-status' },
    { id: '1', title: 'T', status: 'pending', priority: 'ultra-high' },
    { id: '1', title: 'T', status: 'pending', priority: 'medium', createdAt: 'invalid-date' },
    { id: '1', title: 'T', status: 'pending', priority: 'medium', createdAt: new Date().toISOString(), tags: 'not-array' }
  ];

  for (let i = 0; i < invalidTaskInputs.length; i++) {
    const res = validateTask(invalidTaskInputs[i]);
    assert(res.success === false && (res.errors?.length ?? 0) > 0, `validateTask rejects invalid input variant #${i + 1}`);
  }

  // Event Validation
  const validEvent: TaskEvent = {
    id: 'evt-qa-01',
    type: 'task:completed',
    timestamp: new Date().toISOString(),
    payload: { taskId: 'unit-task-1', durationMs: 450 },
    source: 'qa-worker'
  };

  const valEvt1 = validateTaskEvent(validEvent);
  assert(valEvt1.success === true, 'validateTaskEvent succeeds for standard TaskEvent');
  assertEqual(valEvt1.data?.type, 'task:completed', 'validateTaskEvent preserves type');

  const invalidEvents: unknown[] = [
    null,
    { id: '', type: 'task:completed' },
    { id: 'e1', type: 'unknown:type' },
    { id: 'e1', type: 'runner:started', timestamp: 'not-iso' },
    { id: 'e1', type: 'runner:started', timestamp: new Date().toISOString(), payload: 'string-not-record' }
  ];

  for (let i = 0; i < invalidEvents.length; i++) {
    const res = validateTaskEvent(invalidEvents[i]);
    assert(res.success === false, `validateTaskEvent rejects invalid event #${i + 1}`);
  }

  // ==========================================
  // SUITE 2: Integration Tests - Persistence Engine
  // ==========================================
  suite('Integration: State Engine & JSON Persistence');

  const testStoreDir = path.resolve(process.cwd(), 'data', 'qa-store-test.json');
  try {
    await fs.unlink(testStoreDir);
  } catch {
    // ignore
  }

  const store = createTaskStore({ filePath: testStoreDir });

  // Count empty
  assertEqual(await store.count(), 0, 'Initial store count is 0');

  // Save
  const saved1 = await store.save(validTask);
  assertEqual(saved1.id, 'unit-task-1', 'Store saves valid task');
  assertEqual(await store.count(), 1, 'Store count is 1 after save');

  // Get by ID
  const retrieved1 = await store.getById('unit-task-1');
  assert(retrieved1 !== null, 'getById retrieves saved task');
  assertEqual(retrieved1?.title, 'Setup automated CI workflow', 'Retrieved task contents match original');

  // Non-existent ID
  const retrievedNull = await store.getById('non-existent');
  assertEqual(retrievedNull, null, 'getById returns null for non-existent key');

  // Update
  const updated1 = await store.update('unit-task-1', { status: 'completed' });
  assertEqual(updated1.status, 'completed', 'update modifies task status');

  // List and filtering
  const secondTask: Task = {
    id: 'unit-task-2',
    title: 'Write Documentation',
    status: 'pending',
    priority: 'low',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  await store.save(secondTask);

  const allItems = await store.list();
  assertEqual(allItems.length, 2, 'list returns all stored tasks');

  const completedItems = await store.list(t => t.status === 'completed');
  assertEqual(completedItems.length, 1, 'list filter selects 1 completed task');
  assertEqual(completedItems[0].id, 'unit-task-1', 'Filtered item matches expectation');

  // Disk Persistence Reload
  const diskStore = new JsonTaskStore({ filePath: testStoreDir });
  const reloadedList = await diskStore.list();
  assertEqual(reloadedList.length, 2, 'Reloading store from disk preserves task count');
  const reloadedTask = await diskStore.getById('unit-task-1');
  assertEqual(reloadedTask?.status, 'completed', 'Persisted file retains updated fields');

  // Delete
  const delResult = await store.delete('unit-task-2');
  assert(delResult === true, 'delete returns true for deleted task');
  assertEqual(await store.count(), 1, 'count reflects deleted item');
  assertEqual(await store.getById('unit-task-2'), null, 'Deleted task is no longer found');

  // Clear
  await store.clear();
  assertEqual(await store.count(), 0, 'clear empties the entire store');

  try {
    await fs.unlink(testStoreDir);
  } catch {
    // ignore
  }

  // ==========================================
  // SUITE 3: Integration Tests - REST API Server
  // ==========================================
  suite('Integration: REST API Server Endpoints');

  const testApiDb = path.resolve(process.cwd(), 'data', 'qa-api-test.json');
  try {
    await fs.unlink(testApiDb);
  } catch {
    // ignore
  }

  const apiStore = createTaskStore({ filePath: testApiDb });
  const server = createServer({ store: apiStore });
  const port = await server.start(0);
  assert(port > 0, `REST server listening on dynamic port ${port}`);

  try {
    // 3.1 Health Check
    const health = await makeHttpRequest<{ status: string }>({
      port,
      path: '/health',
      method: 'GET'
    });
    assertEqual(health.status, 200, 'GET /health returns HTTP 200');
    assertEqual(health.body.data?.status, 'healthy', 'GET /health data reports healthy');

    // 3.2 List Empty
    const emptyList = await makeHttpRequest<Task[]>({
      port,
      path: '/tasks',
      method: 'GET'
    });
    assertEqual(emptyList.status, 200, 'GET /tasks returns HTTP 200 on empty state');
    assertEqual(emptyList.body.data?.length, 0, 'GET /tasks data is empty array');

    // 3.3 Create Task
    const createRes = await makeHttpRequest<Task>({
      port,
      path: '/tasks',
      method: 'POST',
      body: validTask
    });
    assertEqual(createRes.status, 201, 'POST /tasks returns HTTP 201 Created');
    assertEqual(createRes.body.data?.id, 'unit-task-1', 'POST /tasks returns created item');

    // 3.4 Create Task (Validation Failure)
    const badCreate = await makeHttpRequest({
      port,
      path: '/tasks',
      method: 'POST',
      body: { invalid: 'payload' }
    });
    assertEqual(badCreate.status, 400, 'POST /tasks with bad schema returns HTTP 400');
    assertEqual(badCreate.body.success, false, 'POST /tasks validation failure reports success: false');

    // 3.5 Read Task by ID
    const readRes = await makeHttpRequest<Task>({
      port,
      path: '/tasks/unit-task-1',
      method: 'GET'
    });
    assertEqual(readRes.status, 200, 'GET /tasks/:id returns HTTP 200');
    assertEqual(readRes.body.data?.title, 'Setup automated CI workflow', 'GET /tasks/:id returns correct task');

    // 3.6 Read Task Not Found
    const notFoundRes = await makeHttpRequest({
      port,
      path: '/tasks/unknown-task-id',
      method: 'GET'
    });
    assertEqual(notFoundRes.status, 404, 'GET /tasks/:id for unknown ID returns HTTP 404');
    assertEqual(notFoundRes.body.success, false, 'GET /tasks/:id 404 response success is false');

    // 3.7 Update Task
    const updateRes = await makeHttpRequest<Task>({
      port,
      path: '/tasks/unit-task-1',
      method: 'PUT',
      body: { status: 'completed', priority: 'critical' }
    });
    assertEqual(updateRes.status, 200, 'PUT /tasks/:id returns HTTP 200');
    assertEqual(updateRes.body.data?.status, 'completed', 'PUT /tasks/:id updates status to completed');
    assertEqual(updateRes.body.data?.priority, 'critical', 'PUT /tasks/:id updates priority to critical');

    // 3.8 Query Filter
    const filterRes = await makeHttpRequest<Task[]>({
      port,
      path: '/tasks?status=completed',
      method: 'GET'
    });
    assertEqual(filterRes.status, 200, 'GET /tasks?status=completed returns HTTP 200');
    assertEqual(filterRes.body.data?.length, 1, 'GET /tasks query filter returns filtered items');

    // 3.9 Delete Task
    const deleteRes = await makeHttpRequest<{ deleted: boolean; id: string }>({
      port,
      path: '/tasks/unit-task-1',
      method: 'DELETE'
    });
    assertEqual(deleteRes.status, 200, 'DELETE /tasks/:id returns HTTP 200');
    assertEqual(deleteRes.body.data?.deleted, true, 'DELETE /tasks/:id reports deleted: true');

    // 3.10 Confirm Deleted is 404
    const verifyNotFound = await makeHttpRequest({
      port,
      path: '/tasks/unit-task-1',
      method: 'GET'
    });
    assertEqual(verifyNotFound.status, 404, 'Subsequent GET on deleted task returns HTTP 404');

    // 3.11 Unknown Route 404
    const unknownRoute = await makeHttpRequest({
      port,
      path: '/invalid/endpoint',
      method: 'GET'
    });
    assertEqual(unknownRoute.status, 404, 'Unknown route returns HTTP 404');
  } finally {
    await server.stop();
    try {
      await fs.unlink(testApiDb);
    } catch {
      // ignore
    }
  }

  // ==========================================
  // SUITE 4: System Tests - TestRunner Lifecycle
  // ==========================================
  suite('System: TestRunner Lifecycle & Config');

  const runner = createRunner({
    projectName: 'ai-dev-hub-test-runner-qa',
    version: '1.2.0',
    logLevel: 'debug'
  });
  assert(runner !== null, 'createRunner constructs a valid TestRunner instance');

  let ranWithoutThrowing = false;
  try {
    runner.run();
    ranWithoutThrowing = true;
  } catch {
    ranWithoutThrowing = false;
  }
  assert(ranWithoutThrowing, 'runner.run() executes without unhandled errors');

  // Summary
  const duration = Date.now() - startTime;
  console.log('\n==============================================================');
  console.log(`Results: ${context.passed} passed, ${context.failed} failed (${duration}ms)`);
  console.log('==============================================================');

  return { passed: context.passed, failed: context.failed };
}

if (process.argv[1]?.endsWith('test-runner.js') || process.argv[1]?.endsWith('test-runner.ts')) {
  runAllTests()
    .then(result => {
      if (result.failed > 0) {
        process.exit(1);
      }
    })
    .catch(err => {
      console.error('Test runner fatal error:', err);
      process.exit(1);
    });
}
