import type {
  Task,
  TaskEvent,
  TaskPriority,
  TaskStatus,
  EventType,
  ValidationResult
} from './types.js';

const VALID_STATUSES: readonly TaskStatus[] = [
  'pending',
  'in_progress',
  'completed',
  'failed',
  'blocked'
];

const VALID_PRIORITIES: readonly TaskPriority[] = [
  'low',
  'medium',
  'high',
  'critical'
];

const VALID_EVENT_TYPES: readonly EventType[] = [
  'task:created',
  'task:updated',
  'task:completed',
  'task:failed',
  'runner:started',
  'runner:stopped',
  'test:passed',
  'test:failed'
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidIsoDate(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const timestamp = Date.parse(value);
  return !Number.isNaN(timestamp);
}

/**
 * Validates unknown input against the Task schema.
 */
export function validateTask(input: unknown): ValidationResult<Task> {
  const errors: string[] = [];

  if (!isRecord(input)) {
    return {
      success: false,
      errors: ['Input must be a valid non-null object']
    };
  }

  if (typeof input.id !== 'string' || input.id.trim() === '') {
    errors.push('Task id is required and must be a non-empty string');
  }

  if (typeof input.title !== 'string' || input.title.trim() === '') {
    errors.push('Task title is required and must be a non-empty string');
  }

  if (input.description !== undefined && typeof input.description !== 'string') {
    errors.push('Task description must be a string if provided');
  }

  if (!VALID_STATUSES.includes(input.status as TaskStatus)) {
    errors.push(`Task status must be one of: ${VALID_STATUSES.join(', ')}`);
  }

  if (!VALID_PRIORITIES.includes(input.priority as TaskPriority)) {
    errors.push(`Task priority must be one of: ${VALID_PRIORITIES.join(', ')}`);
  }

  if (input.assignee !== undefined && typeof input.assignee !== 'string') {
    errors.push('Task assignee must be a string if provided');
  }

  if (input.tags !== undefined) {
    if (!Array.isArray(input.tags) || !input.tags.every(t => typeof t === 'string')) {
      errors.push('Task tags must be an array of strings if provided');
    }
  }

  if (input.dependencies !== undefined) {
    if (!Array.isArray(input.dependencies) || !input.dependencies.every(d => typeof d === 'string')) {
      errors.push('Task dependencies must be an array of strings if provided');
    }
  }

  if (!isValidIsoDate(input.createdAt)) {
    errors.push('Task createdAt must be a valid ISO date string');
  }

  if (!isValidIsoDate(input.updatedAt)) {
    errors.push('Task updatedAt must be a valid ISO date string');
  }

  if (input.metadata !== undefined && !isRecord(input.metadata)) {
    errors.push('Task metadata must be an object if provided');
  }

  if (errors.length > 0) {
    return {
      success: false,
      errors
    };
  }

  return {
    success: true,
    data: input as unknown as Task
  };
}

/**
 * Validates unknown input against the TaskEvent schema.
 */
export function validateTaskEvent(input: unknown): ValidationResult<TaskEvent> {
  const errors: string[] = [];

  if (!isRecord(input)) {
    return {
      success: false,
      errors: ['Input must be a valid non-null object']
    };
  }

  if (typeof input.id !== 'string' || input.id.trim() === '') {
    errors.push('Event id is required and must be a non-empty string');
  }

  if (!VALID_EVENT_TYPES.includes(input.type as EventType)) {
    errors.push(`Event type must be one of: ${VALID_EVENT_TYPES.join(', ')}`);
  }

  if (!isValidIsoDate(input.timestamp)) {
    errors.push('Event timestamp must be a valid ISO date string');
  }

  if (!isRecord(input.payload)) {
    errors.push('Event payload must be a key-value object');
  }

  if (typeof input.source !== 'string' || input.source.trim() === '') {
    errors.push('Event source is required and must be a non-empty string');
  }

  if (errors.length > 0) {
    return {
      success: false,
      errors
    };
  }

  return {
    success: true,
    data: input as unknown as TaskEvent
  };
}
