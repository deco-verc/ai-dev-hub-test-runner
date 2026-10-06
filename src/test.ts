import { validateTask, validateTaskEvent } from './validator.js';
import { Task, TaskEvent } from './types.js';

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

console.log('--- Running Tests for Types & Validator ---');

// Test 1: Valid Task
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

// Test 2: Invalid Task (Missing fields and bad enums)
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

// Test 3: Valid Event
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

// Test 4: Invalid Event
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

// Summary
console.log(`\nTests completed: ${passed} passed, ${failed} failed.`);

if (failed > 0) {
  process.exit(1);
}
