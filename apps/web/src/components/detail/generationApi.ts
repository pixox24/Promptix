import { publicGenerationJobSchema, type PublicGenerationCreate, type PublicGenerationJob } from '@promptix/shared';
import { ApiError } from '../../lib/api';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';

async function request(path: string, init?: RequestInit): Promise<PublicGenerationJob> {
  const response = await fetch(`${API_BASE}/api/generations${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...init?.headers },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(
    body?.error?.code ?? 'REQUEST_FAILED',
    body?.error?.message ?? '生成服务暂时不可用',
    response.status,
  );
  return publicGenerationJobSchema.parse(body?.data ?? body);
}

export const createGeneration = (input: PublicGenerationCreate) => request('', { method: 'POST', body: JSON.stringify(input) });
export const getGeneration = (id: string, token: string) => request(`/${id}`, { headers: { authorization: `Bearer ${token}` } });
export const retryGeneration = (id: string, token: string) => request(`/${id}/retry`, { method: 'POST', headers: { authorization: `Bearer ${token}` } });
