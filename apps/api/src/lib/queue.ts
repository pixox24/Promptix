import { Queue } from 'bullmq';
import { parseRedisConnection } from '@promptix/shared';
import { loadEnv } from '../config/env.js';

export const QUEUE_NAME = 'promptix-jobs';

export function redisConnection() {
  return parseRedisConnection(loadEnv().REDIS_URL);
}

let queue: Queue | null = null;
export function getJobQueue() {
  if (!queue) queue = new Queue(QUEUE_NAME, { connection: redisConnection() });
  return queue;
}
