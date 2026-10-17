import { serializeState } from './state';
// 운영 Worker API 기본 경로. 빌드 환경변수가 없어도 운영 서버에 연결되도록 한다.
const endpoint = import.meta.env.VITE_DEAL_HUNTER_API_URL || '/api/cloud';
let code = '';
export function setAccessCode(value:string) { code = value; }
// 접속 코드마다 서버 작업공간(원장)이 다르다. 'main'은 기존 원장.
let workspace = 'main';
export function setWorkspace(value:string) { workspace = /^[a-z0-9][a-z0-9-]{0,31}$/.test(value) ? value : 'main'; }
export function currentWorkspace() { return workspace; }
// 브라우저 임시 저장 키: 'main'은 기존 키 그대로(기존 백업 유지), 다른 작업공간은 이름을 붙여 서로 섞이지 않게
export function storageKey(base:string) { return workspace === 'main' ? base : base + '::' + workspace; }
export function cloudConfigured() { return Boolean(endpoint); }
export async function apiFetch(path:string, init:RequestInit = {}):Promise<Response> {
  if (!endpoint) return Response.json({error:'서버 주소가 설정되지 않았습니다.'},{status:503});
  const url = new URL(endpoint,window.location.origin);
  url.searchParams.set('route',path.split('?')[0].replace('/api/',''));
  for (const [key,value] of new URLSearchParams(path.split('?')[1] || '')) url.searchParams.set(key,value);
  const headers = new Headers(init.headers); headers.set('x-deal-code',code);
  const controller = new AbortController();
  const abort = () => controller.abort();
  init.signal?.addEventListener('abort',abort,{once:true});
  const timer = setTimeout(abort,15000);
  try { return await fetch(url,{...init,headers,signal:controller.signal,cache:'no-store'}); }
  finally { clearTimeout(timer); init.signal?.removeEventListener('abort',abort); }
}
export async function hydrateFiles<T>(state:T):Promise<T> {
  const copy = JSON.parse(serializeState(state));
  const files = new Map<string,Record<string,unknown>[]>();
  for (const item of copy.items || []) for (const attachment of [...(item.attachments || []),...(item.productPhotos || [])]) {
    if (/^[a-z0-9][a-z0-9-]{0,31}\//i.test(attachment.key || '')) files.set(attachment.key,[...(files.get(attachment.key)||[]),attachment]);
  }
  const keys = [...files.keys()];
  for (let start=0;start<keys.length;start+=50) {
    try {
      const response = await apiFetch('/api/files/sign',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({keys:keys.slice(start,start+50)})});
      if (!response.ok) continue;
      const {urls} = await response.json();
      for (const [key,url] of Object.entries(urls || {})) for (const attachment of files.get(key) || []) attachment.url = url;
    } catch { /* Keep original file references; never discard unavailable photos. */ }
  }
  return copy;
}
