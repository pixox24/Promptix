import { loadEnv } from '../config/env.js';

export type PutObjectInput = {
  objectKey: string;
  body: Buffer | Uint8Array | string;
  contentType?: string;
};

/**
 * Minimal Aliyun OSS REST client using Node fetch.
 * Full SDK optional; this covers put / copy / delete for stage A.
 */
export class OssClient {
  private region: string;
  private bucket: string;
  private accessKeyId: string;
  private accessKeySecret: string;
  private endpoint: string;
  private publicBase: string;

  constructor() {
    const env = loadEnv();
    if (
      !env.OSS_REGION ||
      !env.OSS_BUCKET ||
      !env.OSS_ACCESS_KEY_ID ||
      !env.OSS_ACCESS_KEY_SECRET
    ) {
      throw new Error(
        'OSS is not configured (OSS_REGION, OSS_BUCKET, OSS_ACCESS_KEY_ID, OSS_ACCESS_KEY_SECRET)',
      );
    }
    this.region = env.OSS_REGION;
    this.bucket = env.OSS_BUCKET;
    this.accessKeyId = env.OSS_ACCESS_KEY_ID;
    this.accessKeySecret = env.OSS_ACCESS_KEY_SECRET;
    this.endpoint =
      env.OSS_ENDPOINT ||
      `https://${env.OSS_BUCKET}.${env.OSS_REGION}.aliyuncs.com`;
    this.publicBase =
      env.OSS_CDN_BASE ||
      env.OSS_PUBLIC_BASE_URL ||
      `https://${env.OSS_BUCKET}.${env.OSS_REGION}.aliyuncs.com`;
  }

  getPublicUrl(objectKey: string): string {
    const base = this.publicBase.replace(/\/$/, '');
    return `${base}/${objectKey.replace(/^\//, '')}`;
  }

  keys = {
    templateCover: (templateId: string, ext = 'webp') =>
      `public/templates/${templateId}/cover.${ext}`,
    templateSample: (templateId: string, n: number, ext = 'webp') =>
      `public/templates/${templateId}/samples/${n}.${ext}`,
    generation: (jobId: string, n: number, ext = 'png') =>
      `temp/generations/${jobId}/${n}.${ext}`,
    input: (jobId: string, name = 'source') => `temp/inputs/${jobId}/${name}`,
    published: (userId: string, workId: string, ext = 'webp') =>
      `public/published/${userId}/${workId}.${ext}`,
  };

  isConfigured(): boolean {
    return true;
  }

  /**
   * Put object via ali-oss compatible signed REST is complex without SDK.
   * Prefer ali-oss package when credentials present — dynamic import.
   */
  async putObject(input: PutObjectInput): Promise<{ url: string; objectKey: string }> {
    const OSS = (await import('ali-oss')).default;
    const client = new OSS({
      region: this.region,
      bucket: this.bucket,
      accessKeyId: this.accessKeyId,
      accessKeySecret: this.accessKeySecret,
      endpoint: this.endpoint.includes('aliyuncs.com')
        ? undefined
        : this.endpoint,
    });
    await client.put(input.objectKey, Buffer.from(input.body as Buffer), {
      headers: input.contentType
        ? { 'Content-Type': input.contentType }
        : undefined,
    });
    return { objectKey: input.objectKey, url: this.getPublicUrl(input.objectKey) };
  }

  async copyObject(
    sourceKey: string,
    destKey: string,
  ): Promise<{ url: string; objectKey: string }> {
    const OSS = (await import('ali-oss')).default;
    const client = new OSS({
      region: this.region,
      bucket: this.bucket,
      accessKeyId: this.accessKeyId,
      accessKeySecret: this.accessKeySecret,
    });
    await client.copy(destKey, sourceKey);
    return { objectKey: destKey, url: this.getPublicUrl(destKey) };
  }

  async deleteObject(objectKey: string): Promise<void> {
    const OSS = (await import('ali-oss')).default;
    const client = new OSS({
      region: this.region,
      bucket: this.bucket,
      accessKeyId: this.accessKeyId,
      accessKeySecret: this.accessKeySecret,
    });
    await client.delete(objectKey);
  }
}

let _oss: OssClient | null = null;

export function getOss(): OssClient {
  if (!_oss) _oss = new OssClient();
  return _oss;
}

export function tryGetOss(): OssClient | null {
  try {
    return getOss();
  } catch {
    return null;
  }
}
