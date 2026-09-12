export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
export async function apiFetch(url: string, options: RequestInit = {}) {
  let response: Response;
  try { response = await fetch(url, {...options,credentials:'same-origin',signal:options.signal ?? AbortSignal.timeout(20000),headers:{'Content-Type':'application/json',...options.headers}}); }
  catch { const error = new ApiError(0,'NETWORK_ERROR','Không kết nối được máy chủ. Vui lòng thử lại; yêu cầu đặt đơn sẽ giữ nguyên mã để tránh đặt trùng.'); window.dispatchEvent(new CustomEvent('api-error',{detail:error.message})); throw error; }
  if(!response.ok) {
    const body = await response.json().catch(()=>({message:'Máy chủ không thể xử lý yêu cầu'}));
    const error = new ApiError(response.status,body.code || 'API_ERROR',body.message);
    if(response.status===401 && url.startsWith('/api/admin') && !url.endsWith('/login')) window.dispatchEvent(new Event('admin-session-expired'));
    window.dispatchEvent(new CustomEvent('api-error',{detail:error.message}));
    throw error;
  }
  return response;
}
export function stableRequestId(key: string, payload: unknown) {
  const storageKey='tl-request:'+key;
  const fingerprint=JSON.stringify(payload);
  let previous: {fingerprint:string;id:string}|null=null;
  try { previous=JSON.parse(sessionStorage.getItem(storageKey)||'null'); } catch { /* Ignore obsolete drafts. */ }
  if(previous?.fingerprint===fingerprint) return previous.id;
  const id=crypto.randomUUID();
  sessionStorage.setItem(storageKey,JSON.stringify({fingerprint,id}));
  return id;
}
export function completeRequest(key: string) {sessionStorage.removeItem('tl-request:'+key);}
