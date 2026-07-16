import { Queue } from 'bullmq';
import { loadEnv } from '../config/env.js';

export const QUEUE_NAME = 'promptix-jobs';

export function redisConnection() {
  const url = new URL(loadEnv().REDIS_URL);
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username || undefined,
    password: url.password || undefined,
    ...(url.protocol === 'rediss:' ? { tls: {} } : {}),
  };
}

let queue: Queue | null = null;
export function getJobQueue() {
  if (!queue) queue = new Queue(QUEUE_NAME, { connection: redisConnection() });
  return queue;
}
