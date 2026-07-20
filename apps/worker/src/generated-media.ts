import { putObject } from '@promptix/storage';
import { eq, isNull, and, sql } from 'drizzle-orm';
import { db, generationJobs, mediaObjects, promptTemplates } from './db.js';

type RawImage={url?:string;b64_json?:string;width?:number;height?:number};
function extension(mime:string){return mime.includes('webp')?'webp':mime.includes('jpeg')?'jpg':'png'}
export async function persistGeneratedOutput(jobId:string,templateId:string|null,output:unknown){
  const raw=(output as {images?:RawImage[]}|null)?.images??[];const expiresAt=new Date(Date.now()+7*86400000);const images=[];
  for(const [index,image] of raw.entries()){
    let bytes:Buffer;let mime='image/png';
    if(image.b64_json)bytes=Buffer.from(image.b64_json,'base64');else if(image.url){const response=await fetch(image.url);if(!response.ok)throw new Error(`Unable to persist generated image (${response.status})`);bytes=Buffer.from(await response.arrayBuffer());mime=response.headers.get('content-type')?.split(';')[0]||mime}else continue;
    const key=`temp/generations/${jobId}/${index+1}.${extension(mime)}`;const stored=await putObject(key,bytes,mime);
    await db.insert(mediaObjects).values({objectKey:key,bucket:stored.driver,url:stored.url,storageClass:'temp',prefixKind:'generation',expiresAt,ownerType:'job',ownerId:jobId,jobId,mime,bytes:bytes.length,width:image.width,height:image.height,createdAt:new Date()});
    images.push({url:stored.url,mime,width:image.width,height:image.height,expiresAt:expiresAt.toISOString()});
  }
  if(!images.length)throw new Error('Image provider returned no persistable images');
  if(templateId){const recorded=await db.update(generationJobs).set({usageRecordedAt:new Date()}).where(and(eq(generationJobs.id,jobId),isNull(generationJobs.usageRecordedAt))).returning({id:generationJobs.id});if(recorded.length)await db.update(promptTemplates).set({useCount:sql`${promptTemplates.useCount} + 1`}).where(eq(promptTemplates.id,templateId))}
  return {...(output as Record<string,unknown>),images};
}
