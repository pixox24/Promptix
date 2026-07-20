import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import OSS from 'ali-oss';

export type StoredObject={objectKey:string;url:string;driver:'local'|'oss'};
function driver(){if(process.env.STORAGE_DRIVER==='oss')return 'oss';if(process.env.STORAGE_DRIVER==='local')return 'local';return process.env.OSS_BUCKET&&process.env.OSS_ACCESS_KEY_ID&&process.env.OSS_ACCESS_KEY_SECRET?'oss':'local'}
export function localStorageRoot(configured=process.env.LOCAL_STORAGE_DIR??'apps/api/.tmp/uploads'){
  if(path.isAbsolute(configured))return configured;
  const repoRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
  return path.resolve(repoRoot,configured);
}
export async function putObject(objectKey:string,body:Buffer|Uint8Array,contentType?:string):Promise<StoredObject>{
  if(driver()==='oss'){
    const bucket=process.env.OSS_BUCKET!;const region=process.env.OSS_REGION??'oss-cn-hangzhou';
    const client=new OSS({region,bucket,accessKeyId:process.env.OSS_ACCESS_KEY_ID!,accessKeySecret:process.env.OSS_ACCESS_KEY_SECRET!,...(process.env.OSS_ENDPOINT?{endpoint:process.env.OSS_ENDPOINT}:{})});
    await client.put(objectKey,Buffer.from(body),{headers:contentType?{'Content-Type':contentType}:undefined});
    const base=process.env.OSS_CDN_BASE??process.env.OSS_PUBLIC_BASE_URL??`https://${bucket}.${region}.aliyuncs.com`;
    return {objectKey,url:`${base.replace(/\/$/,'')}/${objectKey}`,driver:'oss'};
  }
  const root=localStorageRoot();const target=path.resolve(root,objectKey.replace(/^\/+/,''));if(!target.startsWith(`${root}${path.sep}`))throw new Error('Invalid object key');await mkdir(path.dirname(target),{recursive:true});await writeFile(target,body);return {objectKey,url:`${(process.env.PUBLIC_API_BASE??'http://localhost:8787').replace(/\/$/,'')}/uploads/${objectKey}`,driver:'local'};
}
