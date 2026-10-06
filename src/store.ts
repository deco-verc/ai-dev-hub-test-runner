import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { Task, ValidationResult } from './types.js';
import { validateTask } from './validator.js';

export interface StoreOptions {
  filePath?: string;
  autoSave?: boolean;
}

export interface ITaskStore {
  save(task: Task): Promise<Task>;
  getById(id: string): Promise<Task | null>;
  list(filter?: (task: Task) => boolean): Promise<Task[]>;
  update(id: string, updates: Partial<Task>): Promise<Task>;
  delete(id: string): Promise<boolean>;
  clear(): Promise<void>;
  count(): Promise<number>;
}

export class JsonTaskStore implements ITaskStore {
  private filePath: string;
  private autoSave: boolean;
  private tasks: Map<string, Task> = new Map();
  private loaded = false;

  constructor(options: StoreOptions = {}) {
    this.filePath = options.filePath ?? path.resolve(process.cwd(), 'data', 'tasks.json');
    this.autoSave = options.autoSave ?? true;
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;

    try {
      const data = await fs.readFile(this.filePath, 'utf-8');
      const parsed: unknown = JSON.parse(data);

      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          const valRes: ValidationResult<Task> = validateTask(item);
          if (valRes.success && valRes.data) {
            this.tasks.set(valRes.data.id, valRes.data);
          }
        }
      }
    } catch (err: unknown) {
      const error = err as NodeJS.ErrnoException;
      if (error.code !== 'ENOENT') {
        throw err;
      }
      // If file doesn't exist, we start with an empty map
    }

    this.loaded = true;
  }

  private async persist(): Promise<void> {
    if (!this.autoSave) return;

    const dir = path.dirname(this.filePath);
    await fs.mkdir(dir, { recursive: true });

    const taskArray = Array.from(this.tasks.values());
    const tempPath = `${this.filePath}.tmp.${Date.now()}`;
    const payload = JSON.stringify(taskArray, null, 2);

    await fs.writeFile(tempPath, payload, 'utf-8');
    await fs.rename(tempPath, this.filePath);
  }

  public async save(task: Task): Promise<Task> {
    await this.ensureLoaded();

    const valRes = validateTask(task);
    if (!valRes.success || !valRes.data) {
      throw new Error(`Invalid task: ${(valRes.errors ?? []).join('; ')}`);
    }

    this.tasks.set(valRes.data.id, { ...valRes.data });
    await this.persist();
    return this.tasks.get(valRes.data.id)!;
  }

  public async getById(id: string): Promise<Task | null> {
    await this.ensureLoaded();
    const task = this.tasks.get(id);
    return task ? { ...task } : null;
  }

  public async list(filter?: (task: Task) => boolean): Promise<Task[]> {
    await this.ensureLoaded();
    const all = Array.from(this.tasks.values()).map(t => ({ ...t }));
    if (filter) {
      return all.filter(filter);
    }
    return all;
  }

  public async update(id: string, updates: Partial<Task>): Promise<Task> {
    await this.ensureLoaded();

    const existing = this.tasks.get(id);
    if (!existing) {
      throw new Error(`Task with id '${id}' not found`);
    }

    const merged: Task = {
      ...existing,
      ...updates,
      id: existing.id, // ID cannot be overwritten
      updatedAt: new Date().toISOString()
    };

    const valRes = validateTask(merged);
    if (!valRes.success || !valRes.data) {
      throw new Error(`Invalid updated task: ${(valRes.errors ?? []).join('; ')}`);
    }

    this.tasks.set(id, { ...valRes.data });
    await this.persist();
    return this.tasks.get(id)!;
  }

  public async delete(id: string): Promise<boolean> {
    await this.ensureLoaded();

    if (!this.tasks.has(id)) {
      return false;
    }

    this.tasks.delete(id);
    await this.persist();
    return true;
  }

  public async clear(): Promise<void> {
    await this.ensureLoaded();
    this.tasks.clear();
    await this.persist();
  }

  public async count(): Promise<number> {
    await this.ensureLoaded();
    return this.tasks.size;
  }
}

export function createTaskStore(options?: StoreOptions): ITaskStore {
  return new JsonTaskStore(options);
}
