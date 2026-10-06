import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { validateTask, validateTaskEvent } from './validator.js';
import { Task, TaskEvent } from './types.js';
import { createTaskStore, JsonTaskStore } from './store.js';

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

  // Clean prior test artifacts
  try {
    await fs.unlink(testDataFile);
  } catch {
    // ignore if doesn't exist
  }

  const store = createTaskStore({ filePath: testDataFile });

  // 3.1 Save / Create
  const created = await store.save(validTask);
  assert(created.id === 'task-101', 'Task saved successfully');
  assert(await store.count() === 1, 'Store contains 1 item');

  // 3.2 Read / getById
  const retrieved = await store.getById('task-101');
  assert(retrieved !== null && retrieved.title === 'Implement Authentication', 'Read task by ID returns correct data');

  const notFound = await store.getById('non-existent');
  assert(notFound === null, 'Read non-existent task returns null');

  // 3.3 List & Filter
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

  // 3.4 Update
  const updated = await store.update('task-101', { status: 'completed' });
  assert(updated.status === 'completed', 'Update modifies task status');

  const checkUpdated = await store.getById('task-101');
  assert(checkUpdated?.status === 'completed', 'Updated status is persisted');

  // 3.5 Persistence reload verification
  const newStoreInstance = new JsonTaskStore({ filePath: testDataFile });
  const reloadedTasks = await newStoreInstance.list();
  assert(reloadedTasks.length === 2, 'Reloaded store from disk retains persisted tasks');
  const reloadedTask1 = await newStoreInstance.getById('task-101');
  assert(reloadedTask1?.status === 'completed', 'Persisted file data matches updated state');

  // 3.6 Delete
  const deleted = await store.delete('task-102');
  assert(deleted === true, 'Delete task returns true on existing item');
  assert(await store.count() === 1, 'Task count decremented to 1');
  assert(await store.getById('task-102') === null, 'Deleted task is no longer found');

  // 3.7 Clear
  await store.clear();
  assert(await store.count() === 0, 'Clear removes all tasks');

  // Cleanup test file
  try {
    await fs.unlink(testDataFile);
  } catch {
    // ignore
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
