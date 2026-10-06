/**
 * Data models and type definitions for AI Dev Hub Test Runner
 */

export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'blocked';

export type TaskPriority = 'low' | 'medium' | 'high' | 'critical';

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  assignee?: string;
  tags?: string[];
  dependencies?: string[];
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

export type EventType =
  | 'task:created'
  | 'task:updated'
  | 'task:completed'
  | 'task:failed'
  | 'runner:started'
  | 'runner:stopped'
  | 'test:passed'
  | 'test:failed';

export interface TaskEvent {
  id: string;
  type: EventType;
  timestamp: string;
  payload: Record<string, unknown>;
  source: string;
}

export interface ValidationResult<T> {
  success: boolean;
  data?: T;
  errors?: string[];
}
