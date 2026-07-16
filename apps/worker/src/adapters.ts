import { templateDraftSchema, type TemplateDraft } from '@promptix/shared';

type Provider={protocol:string;baseUrl:string;apiKeyEnv:string|null;defaultModel:string;defaults:unknown;authStyle:string};
type JsonRecord=Record<string,unknown>;

function authHeaders(provider:Provider) {
  const key=provider.apiKeyEnv?process.env[provider.apiKeyEnv]:undefined;
  if(provider.apiKeyEnv&&!key)throw new Error(`Provider key environment variable ${provider.apiKeyEnv} is not set`);
  return {'Content-Type':'application/json',...(key?(provider.authStyle==='header'?{'X-API-Key':key}:{Authorization:`Bearer ${key}`}):{})};
}
function endpoint(base:string,path:string){return `${base.replace(/\/$/,'')}${path}`;}
function extractJson(text:string){const fenced=text.match(/```(?:json)?\s*([\s\S]*?)```/i);return JSON.parse((fenced?.[1]??text).trim());}

const SYSTEM=`你是 Promptix 模板结构化引擎。只输出合法 json，不要 Markdown。字段必须包含 name、summary、description、category、tags、scenarios、variables、promptTemplate；category 仅可为 portrait/ecommerce/poster/logo/illustration/edit。variables 为 1-12 项，每项必须有 id、key、label、type，key 使用英文标识符，type 仅 text/select/number/ratio/image；promptTemplate 必须包含全部变量的 {{key}} 占位符。示例 json：{"name":"人像模板","summary":"一句摘要","description":"详细描述","category":"portrait","tags":[],"scenarios":[],"variables":[{"id":"var-1","key":"subject","label":"主体","type":"text"}],"promptTemplate":"为 {{subject}} 拍摄专业人像"}`;

function chatRequestDefaults(provider:Provider){
  const defaults=(provider.defaults as JsonRecord)??{};
  const {supportsVision:_vision,...requestDefaults}=defaults;
  return requestDefaults;
}

async function inlineImage(imageUrl:string){
  if(imageUrl.startsWith('data:'))return imageUrl;
  const response=await fetch(imageUrl);
  if(!response.ok)throw new Error(`Unable to read source image (${response.status})`);
  const bytes=Buffer.from(await response.arrayBuffer());
  if(bytes.length>10*1024*1024)throw new Error('Source image exceeds 10MB');
  const mime=response.headers.get('content-type')?.split(';')[0]||'image/png';
  return `data:${mime};base64,${bytes.toString('base64')}`;
}

export async function structurePrompt(provider:Provider,input:JsonRecord):Promise<TemplateDraft>{
  const imageUrl=typeof input.imageUrl==='string'?input.imageUrl:undefined; const text=typeof input.text==='string'?input.text:'';
  if(imageUrl&&provider.protocol==='deepseek_chat')throw new Error('DeepSeek Chat does not accept image input; configure a vision-capable OpenAI Chat provider for the first stage');
  const userContent=imageUrl?[{type:'text',text:'请从参考图反推一个可复用的中文 AI 绘图提示词模板。'},{type:'image_url',image_url:{url:await inlineImage(imageUrl)}}]:`请优化并结构化以下需求，输出可复用的中文 AI 绘图提示词模板 json：\n${text}`;
  const requestDefaults=chatRequestDefaults(provider);
  const response=await fetch(endpoint(provider.baseUrl,'/chat/completions'),{method:'POST',headers:authHeaders(provider),body:JSON.stringify({...requestDefaults,model:provider.defaultModel,messages:[{role:'system',content:SYSTEM},{role:'user',content:userContent}],response_format:{type:'json_object'},temperature:requestDefaults.temperature??0.3,stream:false})});
  if(!response.ok)throw new Error(`LLM provider ${response.status}: ${(await response.text()).slice(0,500)}`);
  const payload=await response.json() as {choices?:Array<{message?:{content?:string}}>}; const content=payload.choices?.[0]?.message?.content;
  if(!content)throw new Error('LLM provider returned no content');
  const raw=extractJson(content) as JsonRecord;
  if(Array.isArray(raw.variables)) raw.variables=raw.variables.map((v,i)=>({id:`var-${i+1}`,...(v as JsonRecord)}));
  const parsed=templateDraftSchema.safeParse(raw); if(!parsed.success)throw new Error(`Invalid TemplateDraft: ${parsed.error.issues.map(i=>`${i.path.join('.')}: ${i.message}`).join('; ')}`);
  return parsed.data;
}

export async function describeImage(provider:Provider,imageUrl:string):Promise<string>{
  if(provider.protocol!=='openai_chat')throw new Error('Vision stage requires an OpenAI Chat compatible provider');
  const requestDefaults=chatRequestDefaults(provider);
  const response=await fetch(endpoint(provider.baseUrl,'/chat/completions'),{method:'POST',headers:authHeaders(provider),body:JSON.stringify({...requestDefaults,model:provider.defaultModel,messages:[{role:'system',content:'你是专业视觉分析师。详细描述图片的主体、构图、镜头、光线、材质、色彩、风格、文字和空间关系，供另一个模型重建绘图提示词。不要省略细节。'},{role:'user',content:[{type:'text',text:'请完整分析这张参考图。'},{type:'image_url',image_url:{url:await inlineImage(imageUrl)}}]}],temperature:requestDefaults.temperature??0.2,stream:false})});
  if(!response.ok)throw new Error(`Vision provider ${response.status}: ${(await response.text()).slice(0,500)}`);
  const payload=await response.json() as {choices?:Array<{message?:{content?:string}}>};
  const content=payload.choices?.[0]?.message?.content;
  if(!content)throw new Error('Vision provider returned no image description');
  return content;
}

export async function generateImage(provider:Provider,input:JsonRecord){
  const prompt=typeof input.prompt==='string'?input.prompt:''; if(!prompt)throw new Error('input.prompt is required');
  const defaults=(provider.defaults as JsonRecord)??{};
  const {asyncPollIntervalMs:_poll,asyncTimeoutMs:_timeout,maxQueueSeconds:_maxQueue,...requestDefaults}=defaults;
  const headers:Record<string,string>={...authHeaders(provider)};
  if(provider.protocol==='openai_images_async'){
    headers['X-Async-Mode']='true';
    if(typeof defaults.maxQueueSeconds==='number')headers['X-Async-Image-Max-Queue-Sec']=String(defaults.maxQueueSeconds);
  }
  const response=await fetch(endpoint(provider.baseUrl,'/images/generations'),{method:'POST',headers,body:JSON.stringify({...requestDefaults,model:provider.defaultModel,prompt,size:input.size??requestDefaults.size??'1024x1024',n:input.n??requestDefaults.n??1})});
  if(!response.ok)throw new Error(`Image provider ${response.status}: ${(await response.text()).slice(0,500)}`);
  if(provider.protocol==='openai_images_async'){
    const accepted=await response.json() as {job_id?:string;status_url?:string;status?:string};
    if(!accepted.job_id)throw new Error('Async image provider returned no job_id');
    const statusUrl=accepted.status_url?new URL(accepted.status_url,provider.baseUrl).toString():endpoint(provider.baseUrl,`/images/async-generations/${accepted.job_id}`);
    const pollMs=Math.min(10_000,Math.max(250,Number(defaults.asyncPollIntervalMs??2_000)));
    const timeoutMs=Math.min(3_600_000,Math.max(10_000,Number(defaults.asyncTimeoutMs??900_000)));
    const deadline=Date.now()+timeoutMs;
    while(Date.now()<deadline){
      const polled=await fetch(statusUrl,{headers:authHeaders(provider)});
      if(!polled.ok)throw new Error(`Image job polling ${polled.status}: ${(await polled.text()).slice(0,500)}`);
      const envelope=await polled.json() as {code?:number;message?:string;data?:{status?:string;result_urls?:string[];error_code?:string;error_message?:string;expires_at?:string;cost_usd?:number;image_size_tier?:string}};
      if(envelope.code!==undefined&&envelope.code!==0)throw new Error(`Image provider job error: ${envelope.message??envelope.code}`);
      const data=envelope.data;
      if(data?.status==='done'){
        if(!data.result_urls?.length)throw new Error('Image provider completed without result URLs');
        return {images:data.result_urls.map(url=>({url})),providerJobId:accepted.job_id,expiresAt:data.expires_at,costUsd:data.cost_usd,sizeTier:data.image_size_tier};
      }
      if(data?.status==='failed')throw new Error(`${data.error_code??'image_failed'}: ${data.error_message??'Image generation failed'}`);
      await new Promise(resolve=>setTimeout(resolve,pollMs));
    }
    throw new Error(`Image generation timed out after ${Math.round(timeoutMs/1000)} seconds (provider job ${accepted.job_id} may still be running)`);
  }
  const payload=await response.json() as {data?:Array<{url?:string;b64_json?:string;revised_prompt?:string}>};
  if(!payload.data?.length)throw new Error('Image provider returned no images');
  return {images:payload.data};
}
