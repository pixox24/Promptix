import type { IngestErrorCode, IngestErrorDetails, IngestPipelineStage } from '@promptix/shared';

export class IngestPipelineError extends Error {
  constructor(
    message: string,
    readonly details: IngestErrorDetails,
  ) {
    super(message);
    this.name = 'IngestPipelineError';
  }
}

export function pipelineError(
  code: IngestErrorCode,
  stage: IngestPipelineStage,
  message: string,
  details: Omit<IngestErrorDetails, 'code' | 'stage' | 'retryable'> & { retryable?: boolean } = {},
) {
  const { retryable = false, ...rest } = details;
  return new IngestPipelineError(message, { code, stage, retryable, ...rest });
}
