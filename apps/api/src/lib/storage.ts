import { mkdir, writeFile, copyFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from '../config/env.js';
import { tryGetOss } from './oss.js';

export type StoredObject = { objectKey: string; url: string };

function safeLocalPath(objectKey: string) {
  const env = loadEnv();
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
  const root = path.isAbsolute(env.LOCAL_STORAGE_DIR) ? env.LOCAL_STORAGE_DIR : path.resolve(repoRoot, env.LOCAL_STORAGE_DIR);
  const target = path.resolve(root, objectKey.replace(/^\/+/, ''));
  if (!target.startsWith(root + path.sep)) throw new Error('Invalid object key');
  return { root, target };
}

export function storageKind(): 'oss' | 'local' {
  const env = loadEnv();
  if (env.STORAGE_DRIVER === 'oss') return 'oss';
  if (env.STORAGE_DRIVER === 'local') return 'local';
  return tryGetOss() ? 'oss' : 'local';
}

export async function putObject(
  objectKey: string,
  body: Buffer | Uint8Array,
  contentType?: string,
): Promise<StoredObject> {
  if (storageKind() === 'oss') {
    return (await tryGetOss()!.putObject({ objectKey, body, contentType }));
  }
  const { target } = safeLocalPath(objectKey);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, body);
  const base = loadEnv().PUBLIC_API_BASE.replace(/\/$/, '');
  return { objectKey, url: `${base}/uploads/${objectKey}` };
}

export async function copyObject(sourceKey: string, destKey: string) {
  if (storageKind() === 'oss') return tryGetOss()!.copyObject(sourceKey, destKey);
  const source = safeLocalPath(sourceKey).target;
  const dest = safeLocalPath(destKey).target;
  await mkdir(path.dirname(dest), { recursive: true });
  await copyFile(source, dest);
  const base = loadEnv().PUBLIC_API_BASE.replace(/\/$/, '');
  return { objectKey: destKey, url: `${base}/uploads/${destKey}` };
}

export async function deleteObject(objectKey: string) {
  if (storageKind() === 'oss') return tryGetOss()!.deleteObject(objectKey);
  await unlink(safeLocalPath(objectKey).target).catch(() => undefined);
}

export function localStorageRoot() {
  const configured=loadEnv().LOCAL_STORAGE_DIR;
  const repoRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
  return path.isAbsolute(configured)?configured:path.resolve(repoRoot,configured);
}
