import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as http from 'node:http';
import { validateTask, validateTaskEvent } from './validator.js';
import { Task, TaskEvent } from './types.js';
import { createTaskStore, JsonTaskStore } from './store.js';
import { createServer, ApiResponse } from './server.js';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failed++;
  }
}

function makeRequest<T = unknown>(options: {
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

async function runTests(): Promise<void> {
  console.log('--- Running Tests for AI Dev Hub Test Runner ---');

  // Suite 1: Task Validation
  console.log('\n[Suite 1: Task Validation]');
  const validTask: Task = {
    id: 'task-101',
    title: 'Implement Authentication',
    description: 'Add OAuth2 authentication flow',
    status: 'in_progress',
    priority: 'high',
    assignee: 'builder-agent',
    tags: ['auth', 'security'],
    dependencies: ['task-100'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    metadata: { retryCount: 0 }
  };

  const taskResValid = validateTask(validTask);
  assert(taskResValid.success === true, 'Valid task passes validation');
  assert(taskResValid.data?.id === 'task-101', 'Task ID is correctly preserved');
  assert(!taskResValid.errors, 'No errors for valid task');

  const invalidTask = {
    id: '',
    title: 'Missing required status',
    status: 'unknown_status',
    priority: 'ultra_high',
    createdAt: 'not-a-date',
    updatedAt: new Date().toISOString()
  };

  const taskResInvalid = validateTask(invalidTask);
  assert(taskResInvalid.success === false, 'Invalid task fails validation');
  assert(
    (taskResInvalid.errors?.length ?? 0) >= 4,
    `Catches multiple validation errors (found: ${taskResInvalid.errors?.length})`
  );

  // Suite 2: TaskEvent Validation
  console.log('\n[Suite 2: TaskEvent Validation]');
  const validEvent: TaskEvent = {
    id: 'evt-202',
    type: 'task:created',
    timestamp: new Date().toISOString(),
    payload: { taskId: 'task-101', initiator: 'supervisor' },
    source: 'supervisor-service'
  };

  const eventResValid = validateTaskEvent(validEvent);
  assert(eventResValid.success === true, 'Valid event passes validation');
  assert(eventResValid.data?.type === 'task:created', 'Event type is correctly preserved');
  assert(!eventResValid.errors, 'No errors for valid event');

  const invalidEvent = {
    id: 'evt-203',
    type: 'invalid:action',
    timestamp: 'invalid-timestamp',
    payload: 'not-an-object',
    source: ''
  };

  const eventResInvalid = validateTaskEvent(invalidEvent);
  assert(eventResInvalid.success === false, 'Invalid event fails validation');
  assert(
    (eventResInvalid.errors?.length ?? 0) >= 4,
    `Catches multiple event validation errors (found: ${eventResInvalid.errors?.length})`
  );

  // Suite 3: State Engine & Persistence (JsonTaskStore)
  console.log('\n[Suite 3: State Engine & Persistence (JsonTaskStore)]');
  const testDataFile = path.resolve(process.cwd(), 'data', 'test-tasks.json');

  try {
    await fs.unlink(testDataFile);
  } catch {
    // ignore if doesn't exist
  }

  const store = createTaskStore({ filePath: testDataFile });

  const created = await store.save(validTask);
  assert(created.id === 'task-101', 'Task saved successfully');
  assert((await store.count()) === 1, 'Store contains 1 item');

  const retrieved = await store.getById('task-101');
  assert(retrieved !== null && retrieved.title === 'Implement Authentication', 'Read task by ID returns correct data');

  const notFound = await store.getById('non-existent');
  assert(notFound === null, 'Read non-existent task returns null');

  const secondTask: Task = {
    id: 'task-102',
    title: 'Deploy to Staging',
    status: 'pending',
    priority: 'low',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  await store.save(secondTask);

  const allTasks = await store.list();
  assert(allTasks.length === 2, 'List returns all 2 tasks');

  const pendingTasks = await store.list(t => t.status === 'pending');
  assert(pendingTasks.length === 1 && pendingTasks[0].id === 'task-102', 'List filter works accurately');

  const updated = await store.update('task-101', { status: 'completed' });
  assert(updated.status === 'completed', 'Update modifies task status');

  const checkUpdated = await store.getById('task-101');
  assert(checkUpdated?.status === 'completed', 'Updated status is persisted');

  const newStoreInstance = new JsonTaskStore({ filePath: testDataFile });
  const reloadedTasks = await newStoreInstance.list();
  assert(reloadedTasks.length === 2, 'Reloaded store from disk retains persisted tasks');
  const reloadedTask1 = await newStoreInstance.getById('task-101');
  assert(reloadedTask1?.status === 'completed', 'Persisted file data matches updated state');

  const deleted = await store.delete('task-102');
  assert(deleted === true, 'Delete task returns true on existing item');
  assert((await store.count()) === 1, 'Task count decremented to 1');
  assert((await store.getById('task-102')) === null, 'Deleted task is no longer found');

  await store.clear();
  assert((await store.count()) === 0, 'Clear removes all tasks');

  try {
    await fs.unlink(testDataFile);
  } catch {
    // ignore
  }

  // Suite 4: REST API Server & Route Handlers
  console.log('\n[Suite 4: REST API Server & Route Handlers]');
  const apiDataFile = path.resolve(process.cwd(), 'data', 'api-test-tasks.json');
  try {
    await fs.unlink(apiDataFile);
  } catch {
    // ignore
  }

  const apiStore = createTaskStore({ filePath: apiDataFile });
  const server = createServer({ store: apiStore });
  const port = await server.start(0);
  assert(port > 0, `Server successfully started on dynamic port ${port}`);

  try {
    // 4.1 Health Check
    const healthRes = await makeRequest<{ status: string }>({
      port,
      path: '/health',
      method: 'GET'
    });
    assert(healthRes.status === 200, 'GET /health returns HTTP 200');
    assert(healthRes.body.success === true, 'GET /health response format is standard JSON');

    // 4.2 GET /tasks (Initially empty)
    const initialList = await makeRequest<Task[]>({
      port,
      path: '/tasks',
      method: 'GET'
    });
    assert(initialList.status === 200, 'GET /tasks returns HTTP 200');
    assert(Array.isArray(initialList.body.data) && initialList.body.data.length === 0, 'Initial task list is empty');

    // 4.3 POST /tasks (Valid payload)
    const newTaskPayload: Task = {
      id: 'task-api-1',
      title: 'Build REST API Endpoints',
      description: 'Implement GET, POST, PUT, DELETE for tasks',
      status: 'pending',
      priority: 'high',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const postRes = await makeRequest<Task>({
      port,
      path: '/tasks',
      method: 'POST',
      body: newTaskPayload
    });
    assert(postRes.status === 201, 'POST /tasks returns HTTP 201 Created');
    assert(postRes.body.success === true, 'POST /tasks reports success');
    assert(postRes.body.data?.id === 'task-api-1', 'POST /tasks returns created task ID');

    // 4.4 POST /tasks (Invalid payload)
    const badPostRes = await makeRequest({
      port,
      path: '/tasks',
      method: 'POST',
      body: { title: 'Missing ID and other required fields' }
    });
    assert(badPostRes.status === 400, 'POST /tasks with bad schema returns HTTP 400 Bad Request');
    assert(badPostRes.body.success === false, 'POST /tasks bad schema success is false');
    assert(Array.isArray(badPostRes.body.errors), 'POST /tasks bad schema provides error details');

    // 4.5 GET /tasks/:id (Found)
    const getRes = await makeRequest<Task>({
      port,
      path: '/tasks/task-api-1',
      method: 'GET'
    });
    assert(getRes.status === 200, 'GET /tasks/:id returns HTTP 200');
    assert(getRes.body.data?.title === 'Build REST API Endpoints', 'GET /tasks/:id returns matching task');

    // 4.6 PUT /tasks/:id (Update)
    const putRes = await makeRequest<Task>({
      port,
      path: '/tasks/task-api-1',
      method: 'PUT',
      body: { status: 'in_progress', priority: 'critical' }
    });
    assert(putRes.status === 200, 'PUT /tasks/:id returns HTTP 200');
    assert(putRes.body.data?.status === 'in_progress', 'PUT /tasks/:id updates status');
    assert(putRes.body.data?.priority === 'critical', 'PUT /tasks/:id updates priority');

    // 4.7 GET /tasks (Filter by query param)
    const filteredRes = await makeRequest<Task[]>({
      port,
      path: '/tasks?status=in_progress',
      method: 'GET'
    });
    assert(filteredRes.status === 200, 'GET /tasks?status=in_progress returns HTTP 200');
    assert(filteredRes.body.data?.length === 1, 'Filter query param returns 1 matching item');

    // 4.8 GET /tasks/:id (Not Found)
    const get404 = await makeRequest({
      port,
      path: '/tasks/non-existent-id',
      method: 'GET'
    });
    assert(get404.status === 404, 'GET /tasks/:id for missing item returns HTTP 404');

    // 4.9 DELETE /tasks/:id
    const deleteRes = await makeRequest<{ deleted: boolean; id: string }>({
      port,
      path: '/tasks/task-api-1',
      method: 'DELETE'
    });
    assert(deleteRes.status === 200, 'DELETE /tasks/:id returns HTTP 200');
    assert(deleteRes.body.data?.deleted === true, 'DELETE /tasks/:id reports deleted: true');

    const verifyDeleted = await makeRequest({
      port,
      path: '/tasks/task-api-1',
      method: 'GET'
    });
    assert(verifyDeleted.status === 404, 'Deleted task is no longer found (404)');
  } finally {
    await server.stop();
    try {
      await fs.unlink(apiDataFile);
    } catch {
      // ignore
    }
  }

  // Summary
  console.log(`\nTests completed: ${passed} passed, ${failed} failed.`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test execution failed with unhandled error:', err);
  process.exit(1);
});
