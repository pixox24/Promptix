type QueueJobForRetry = {
  getState(): Promise<string>;
  remove(): Promise<void>;
};

type QueueForRetry = {
  getJob(id: string): Promise<QueueJobForRetry | undefined | null>;
};

export class QueueJobStillRunningError extends Error {
  constructor(state: string) {
    super(`BullMQ job is still ${state}`);
    this.name = 'QueueJobStillRunningError';
  }
}

export async function clearTerminalQueueJobForRetry(
  queue: QueueForRetry,
  bullJobId: string,
) {
  const existing = await queue.getJob(bullJobId);
  if (!existing) return;

  const state = await existing.getState();
  if (state !== 'failed' && state !== 'completed') {
    throw new QueueJobStillRunningError(state);
  }
  await existing.remove();
}
