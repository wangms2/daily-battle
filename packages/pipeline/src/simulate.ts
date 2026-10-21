// Runs battle jobs in parallel across worker threads. Every job carries its own
// seeds, so results are the same for any worker count.
import { createRequire } from 'node:module';
import { availableParallelism } from 'node:os';
import { pathToFileURL } from 'node:url';
import { Worker } from 'node:worker_threads';
import { runJob, type Job, type JobResult } from './job';

/** Jobs sent to a worker at a time. */
const BATCH = 8;

/**
 * Workers load the TypeScript sources through tsx. Resolve it from this
 * package, since `--import tsx` would resolve from the current directory.
 */
const TSX_LOADER = pathToFileURL(createRequire(import.meta.url).resolve('tsx')).href;

export class Simulator {
  private readonly pool: Worker[] = [];
  private nextId = 0;

  constructor(readonly workers = Math.max(1, availableParallelism() - 1)) {
    for (let i = 0; i < workers; i++) {
      this.pool.push(
        new Worker(new URL('./worker.ts', import.meta.url), { execArgv: ['--import', TSX_LOADER] }),
      );
    }
  }

  async run(jobs: Job[]): Promise<JobResult[]> {
    if (!this.pool.length) return jobs.map(runJob);
    const results: JobResult[] = new Array(jobs.length);
    let cursor = 0;
    await Promise.all(
      this.pool.map(async (worker) => {
        while (cursor < jobs.length) {
          const start = cursor;
          cursor += BATCH;
          const batch = jobs.slice(start, start + BATCH);
          const done = await this.send(worker, batch);
          done.forEach((r, i) => (results[start + i] = r));
        }
      }),
    );
    return results;
  }

  private send(worker: Worker, jobs: Job[]): Promise<JobResult[]> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const onMessage = (msg: { id: number; results: JobResult[] }) => {
        if (msg.id !== id) return;
        worker.off('message', onMessage);
        worker.off('error', reject);
        resolve(msg.results);
      };
      worker.on('message', onMessage);
      worker.once('error', reject);
      worker.postMessage({ id, jobs });
    });
  }

  async close(): Promise<void> {
    await Promise.all(this.pool.map((w) => w.terminate()));
  }
}
