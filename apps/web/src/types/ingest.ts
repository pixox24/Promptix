import type { IngestErrorCode, IngestErrorDetails, IngestFlowType, IngestProgress, IngestResultMeta, JobStatus, TemplateDraft } from '@promptix/shared';

export type IngestJob = {
  id: string;
  type: IngestFlowType;
  status: JobStatus;
  input: unknown;
  output?: TemplateDraft | null;
  errorMessage?: string | null;
  errorCode?: IngestErrorCode | null;
  errorDetails?: IngestErrorDetails | null;
  progress?: IngestProgress | null;
  resultMeta?: IngestResultMeta | null;
  modelId?: string | null;
  visionModelId?: string | null;
  createdAt: string;
};

export type IngestPromptConfig = {
  flowType: IngestFlowType;
  prompt: string;
  updatedAt: string | null;
};

export type IngestFlowStatus = 'idle' | 'queued' | 'running' | 'review' | 'failed';
