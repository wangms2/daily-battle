import { parentPort } from 'node:worker_threads';
import { runJob, type Job } from './job';

parentPort!.on('message', (msg: { id: number; jobs: Job[] }) => {
  parentPort!.postMessage({ id: msg.id, results: msg.jobs.map(runJob) });
});
