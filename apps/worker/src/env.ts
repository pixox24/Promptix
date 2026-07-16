import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parseRedisConnection } from '@promptix/shared';

export function loadEnvFile() {
  for (const file of [path.resolve(process.cwd(), '.env'), path.resolve(process.cwd(), '../../.env')]) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file,'utf8').split(/\r?\n/)) {
      const text=line.trim(); if(!text||text.startsWith('#'))continue;
      const eq=text.indexOf('='); if(eq<1)continue;
      const key=text.slice(0,eq).trim(); let value=text.slice(eq+1).trim();
      if((value.startsWith('"')&&value.endsWith('"'))||(value.startsWith("'")&&value.endsWith("'")))value=value.slice(1,-1);
      if(process.env[key]===undefined)process.env[key]=value;
    }
    break;
  }
}

export function required(name:string) {
  const value=process.env[name]; if(!value)throw new Error(`${name} is required`); return value;
}

export function redisConnection() {
  return parseRedisConnection(process.env.REDIS_URL??'redis://localhost:6379');
}
