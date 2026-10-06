import * as http from 'node:http';
import { URL } from 'node:url';
import { ITaskStore, JsonTaskStore } from './store.js';
import { Task } from './types.js';
import { validateTask } from './validator.js';

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  errors?: string[];
}

export interface ServerConfig {
  port?: number;
  host?: string;
  store?: ITaskStore;
}

export class TaskServer {
  private server: http.Server | null = null;
  private store: ITaskStore;
  private port: number;
  private host: string;

  constructor(config: ServerConfig = {}) {
    this.store = config.store ?? new JsonTaskStore();
    this.port = config.port ?? 3000;
    this.host = config.host ?? '127.0.0.1';
  }

  private sendJson<T>(res: http.ServerResponse, statusCode: number, body: ApiResponse<T>): void {
    const payload = JSON.stringify(body);
    res.writeHead(statusCode, {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload)
    });
    res.end(payload);
  }

  private async parseJsonBody(req: http.IncomingMessage): Promise<unknown> {
    return new Promise((resolve, reject) => {
      let data = '';
      req.on('data', chunk => {
        data += chunk;
        if (data.length > 1e6) {
          reject(new Error('Payload too large'));
        }
      });
      req.on('end', () => {
        if (!data || data.trim() === '') {
          resolve({});
          return;
        }
        try {
          resolve(JSON.parse(data));
        } catch {
          reject(new Error('Invalid JSON'));
        }
      });
      req.on('error', err => reject(err));
    });
  }

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const fullUrl = new URL(req.url ?? '/', `http://${req.headers.host || 'localhost'}`);
    const pathname = fullUrl.pathname;
    const method = (req.method ?? 'GET').toUpperCase();

    // CORS headers for interoperability
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    try {
      // Health check
      if (pathname === '/health' && method === 'GET') {
        this.sendJson(res, 200, { success: true, data: { status: 'healthy' } });
        return;
      }

      // GET /tasks
      if (pathname === '/tasks' && method === 'GET') {
        const statusQuery = fullUrl.searchParams.get('status');
        const tasks = await this.store.list(statusQuery ? t => t.status === statusQuery : undefined);
        this.sendJson(res, 200, { success: true, data: tasks });
        return;
      }

      // POST /tasks
      if (pathname === '/tasks' && method === 'POST') {
        const body = await this.parseJsonBody(req);
        const validation = validateTask(body);
        if (!validation.success || !validation.data) {
          this.sendJson(res, 400, {
            success: false,
            errors: validation.errors ?? ['Invalid task schema']
          });
          return;
        }

        const saved = await this.store.save(validation.data);
        this.sendJson(res, 201, { success: true, data: saved });
        return;
      }

      // Matched /tasks/:id routes
      const taskDetailMatch = pathname.match(/^\/tasks\/([^/]+)$/);
      if (taskDetailMatch) {
        const taskId = decodeURIComponent(taskDetailMatch[1]);

        // GET /tasks/:id
        if (method === 'GET') {
          const task = await this.store.getById(taskId);
          if (!task) {
            this.sendJson(res, 404, { success: false, error: `Task '${taskId}' not found` });
            return;
          }
          this.sendJson(res, 200, { success: true, data: task });
          return;
        }

        // PUT /tasks/:id
        if (method === 'PUT') {
          const body = (await this.parseJsonBody(req)) as Partial<Task>;
          const existing = await this.store.getById(taskId);
          if (!existing) {
            this.sendJson(res, 404, { success: false, error: `Task '${taskId}' not found` });
            return;
          }

          try {
            const updated = await this.store.update(taskId, body);
            this.sendJson(res, 200, { success: true, data: updated });
          } catch (err: unknown) {
            const error = err as Error;
            this.sendJson(res, 400, { success: false, error: error.message });
          }
          return;
        }

        // DELETE /tasks/:id
        if (method === 'DELETE') {
          const deleted = await this.store.delete(taskId);
          if (!deleted) {
            this.sendJson(res, 404, { success: false, error: `Task '${taskId}' not found` });
            return;
          }
          this.sendJson(res, 200, { success: true, data: { deleted: true, id: taskId } });
          return;
        }
      }

      // Route Not Found
      this.sendJson(res, 404, { success: false, error: `Route ${method} ${pathname} not found` });
    } catch (err: unknown) {
      const error = err as Error;
      this.sendJson(res, 500, { success: false, error: error.message || 'Internal Server Error' });
    }
  }

  public async start(port?: number): Promise<number> {
    if (port) {
      this.port = port;
    }

    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        this.handleRequest(req, res).catch(err => {
          this.sendJson(res, 500, { success: false, error: (err as Error).message });
        });
      });

      this.server.on('error', reject);

      this.server.listen(this.port, this.host, () => {
        const address = this.server?.address();
        const actualPort = typeof address === 'object' && address ? address.port : this.port;
        resolve(actualPort);
      });
    });
  }

  public async stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.server) {
        resolve();
        return;
      }
      this.server.close(err => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
}

export function createServer(config?: ServerConfig): TaskServer {
  return new TaskServer(config);
}
