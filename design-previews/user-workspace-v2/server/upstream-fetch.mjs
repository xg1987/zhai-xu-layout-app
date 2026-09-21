// Never follow redirects carrying provider credentials. Workers accepts manual mode.
export class UpstreamError extends Error {
 constructor(code) { super(code); this.code=code; }
}
export async function upstreamFetch(url, options, fetchImpl=(...args)=>fetch(...args)) {
 let response;
 try { response=await fetchImpl(url,{...options,redirect:'manual'}); }
 catch(error) {
  const name=error?.name;
  if(name==='TimeoutError'||name==='AbortError')throw new UpstreamError('timeout');
  if(name==='TypeError'&&/Invalid redirect|Illegal invocation|incorrect this|Unsupported/i.test(String(error.message)))throw new UpstreamError('runtime');
  throw new UpstreamError('network');
 }
 if(response.status>=300&&response.status<400){await response.body?.cancel();throw new UpstreamError('redirect');}
 return response;
}
