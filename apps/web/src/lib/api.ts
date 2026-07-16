export class ApiError extends Error {
  code:string; status:number;
  constructor(code:string,message:string,status:number){super(message);this.code=code;this.status=status;}
}

export async function api<T>(path:string,options:RequestInit={}):Promise<T>{
  const response=await fetch(path,{...options,credentials:'include',headers:{...(options.body instanceof FormData?{}:{'Content-Type':'application/json'}),...options.headers}});
  const payload=await response.json().catch(()=>null) as {data?:T;error?:{code:string;message:string}}|null;
  if(!response.ok)throw new ApiError(payload?.error?.code??'REQUEST_FAILED',payload?.error?.message??`Request failed (${response.status})`,response.status);
  return payload?.data as T;
}
