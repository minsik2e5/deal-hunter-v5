import {validateState,serializeState} from '../lib/state.ts';
type Statement={bind:(...values:unknown[])=>Statement;first:()=>Promise<any>;all:()=>Promise<any>};
type Database={prepare:(sql:string)=>Statement;batch:(statements:Statement[])=>Promise<any[]>};
type Env={DB:Database;BUCKET:any;ASSETS:{fetch:(r:Request)=>Promise<Response>};DEAL_HUNTER_ACCESS_HASH?:string;DEAL_HUNTER_WORKSPACES?:string;FILE_SIGNING_KEY?:string};
const encoder=new TextEncoder(),WORKSPACE='main';
const operatingHash=''; // Configure DEAL_HUNTER_ACCESS_HASH in the production runtime.
// Each access code opens its own workspace (ledger, versions, photos). DEAL_HUNTER_ACCESS_HASH opens 'main'.
// DEAL_HUNTER_WORKSPACES adds more as a runtime secret: "friend1:<sha256 hex>,friend2:<sha256 hex>". Never commit it.
const WORKSPACE_NAME=/^[a-z0-9][a-z0-9-]{0,31}$/;
export function workspaceCodes(env:{DEAL_HUNTER_ACCESS_HASH?:string;DEAL_HUNTER_WORKSPACES?:string}):[string,string][]{
 const list:[string,string][]=[[WORKSPACE,(env.DEAL_HUNTER_ACCESS_HASH||operatingHash).toLowerCase()]];
 for(const part of (env.DEAL_HUNTER_WORKSPACES||'').split(/[\s,]+/)){
  const [name,hash]=part.split(':');
  if(!name||!hash||!WORKSPACE_NAME.test(name)||name===WORKSPACE||!/^[0-9a-f]{64}$/i.test(hash))continue;
  if(list.some(([n,h])=>n===name||h===hash.toLowerCase()))continue;
  list.push([name,hash.toLowerCase()]);
 }
 return list;
}
async function workspaceFor(env:Env,code:string){
 if(!code||code.length>256)return null;
 const digest=await sha(code);let found:string|null=null;
 for(const [name,hash] of workspaceCodes(env))if(hash&&equal(digest,hash)&&!found)found=name; // compares every entry
 return found;
}
async function sha(text:string){return hex(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(text))));}
function hex(b:Uint8Array){return [...b].map(v=>v.toString(16).padStart(2,'0')).join('');}
function equal(a:string,b:string){if(a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;}
function json(data:unknown,status=200){return Response.json(data,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});}
function validKey(key:string,workspace?:string){const m=/^([a-z0-9][a-z0-9-]{0,31})\/[0-9a-f-]{36}-[^/]+$/i.exec(key);return Boolean(m)&&!key.includes('..')&&(workspace===undefined||m![1]===workspace);}
async function limitedJson(req:Request,max=6000000){const reader=req.body?.getReader();if(!reader)throw new Error('요청을 확인해 주세요.');const parts:Uint8Array[]=[];let size=0;while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>max){await reader.cancel();throw new Error('too large');}parts.push(value);}const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}return JSON.parse(new TextDecoder().decode(bytes));}
async function mac(env:Env,value:string){if(!env.FILE_SIGNING_KEY)throw new Error('사진 저장소 설정이 필요합니다.');const key=await crypto.subtle.importKey('raw',encoder.encode(env.FILE_SIGNING_KEY),{name:'HMAC',hash:'SHA-256'},false,['sign']);return hex(new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode(value))));}
async function signed(env:Env,request:Request,key:string){const expires=Math.floor(Date.now()/1000)+3600,sig=await mac(env,`${key}:${expires}`),url=new URL('/api/files/raw',request.url);url.search=new URLSearchParams({key,expires:String(expires),sig}).toString();return url.href;}
function fileType(b:Uint8Array){if(b[0]===255&&b[1]===216&&b[2]===255)return 'image/jpeg';if(b.length>=8&&b.slice(0,8).every((v,i)=>v===[137,80,78,71,13,10,26,10][i]))return 'image/png';const prefix=new TextDecoder().decode(b.slice(0,12));if(/^GIF8[79]a/.test(prefix))return 'image/gif';if(prefix.startsWith('RIFF')&&prefix.slice(8,12)==='WEBP')return 'image/webp';if(prefix.startsWith('%PDF-'))return 'application/pdf';return '';}
// D1 batch executes snapshot + compare-and-swap + read-back as one transaction.
// No read-before-write race and no runtime schema initialization or automatic seeding.
export async function commit(db:Database,expected:number,state:any,versionId?:number,workspace:string=WORKSPACE){
 const stamp=new Date().toISOString(),restore=versionId!==undefined;
 const statements:Statement[]=[];
 const target=restore?' AND EXISTS (SELECT 1 FROM ledger_versions WHERE workspace=? AND id=?)':'';
 const snapshot=db.prepare(`INSERT INTO ledger_versions(workspace,revision,state_json,created_at) SELECT workspace,revision,state_json,? FROM ledger WHERE workspace=? AND revision=?${target}`);
 statements.push(snapshot.bind(stamp,workspace,expected,...(restore?[workspace,versionId]:[])));
 if(restore){statements.push(db.prepare('UPDATE ledger SET state_json=(SELECT state_json FROM ledger_versions WHERE workspace=? AND id=?),revision=revision+1,updated_at=? WHERE workspace=? AND revision=? AND EXISTS(SELECT 1 FROM ledger_versions WHERE workspace=? AND id=?) RETURNING revision,updated_at').bind(workspace,versionId,stamp,workspace,expected,workspace,versionId));}
 else if(expected===0){statements.push(db.prepare('INSERT INTO ledger(workspace,revision,state_json,updated_at) VALUES(?,1,?,?) ON CONFLICT(workspace) DO NOTHING RETURNING revision,updated_at').bind(workspace,serializeState(state),stamp));}
 else{statements.push(db.prepare('UPDATE ledger SET state_json=?,revision=revision+1,updated_at=? WHERE workspace=? AND revision=? RETURNING revision,updated_at').bind(serializeState(state),stamp,workspace,expected));}
 statements.push(db.prepare('SELECT revision,state_json,updated_at FROM ledger WHERE workspace=?').bind(workspace));
 if(restore)statements.push(db.prepare('SELECT id,revision FROM ledger_versions WHERE workspace=? AND id=?').bind(workspace,versionId));
 const result=await db.batch(statements),changed=result[1].results?.[0],current=result[2].results?.[0];
 if(!changed){if(restore&&current?.revision===expected&&!result[3].results?.length)return {missing:true,conflict:false,revision:current?.revision||0};return {conflict:true,revision:current?.revision||0,updatedAt:current?.updated_at};}
 return {conflict:false,revision:changed.revision,updatedAt:changed.updated_at,...(restore?{state:JSON.parse(current.state_json),restoredFromRevision:result[3].results[0].revision}:{})};
}
export default {async fetch(request:Request,env:Env):Promise<Response>{
 const url=new URL(request.url);
 if(!url.pathname.startsWith('/api/'))return env.ASSETS.fetch(request);
 // Private Site access is enforced by dispatch; the operating code is an additional gate.
 const origin=request.headers.get('origin');if(origin&&origin!==url.origin)return json({error:'허용되지 않은 주소입니다.'},403);
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{'access-control-allow-origin':url.origin,'access-control-allow-methods':'GET,PUT,POST,OPTIONS','access-control-allow-headers':'content-type,x-deal-code'}});
 try{
  if(url.pathname==='/api/files/raw'&&request.method==='GET'){
   const key=url.searchParams.get('key')||'',expires=Number(url.searchParams.get('expires')),sig=url.searchParams.get('sig')||'';
   if(!validKey(key)||!Number.isSafeInteger(expires)||expires<Math.floor(Date.now()/1000)||expires>Math.floor(Date.now()/1000)+3605||!equal(await mac(env,`${key}:${expires}`),sig))return json({error:'사진 링크가 만료되었습니다. 원장을 다시 열어 주세요.'},403);
   const object=await env.BUCKET.get(key);if(!object)return json({error:'사진 원본을 확인해 주세요.'},404);
   return new Response(object.body,{headers:{'content-type':object.httpMetadata?.contentType||'application/octet-stream','cache-control':'private,max-age=60','x-content-type-options':'nosniff','content-security-policy':"default-src 'none'; sandbox"}});
  }
  const workspace=await workspaceFor(env,request.headers.get('x-deal-code')||'');
  if(!workspace)return json({error:'접속 코드를 확인해 주세요.'},401);
  const route=url.searchParams.get('route')||url.pathname.replace('/api/','');
  if(route==='whoami'&&request.method==='GET')return json({workspace});
  if(route==='state'&&request.method==='GET'){
   const row=await env.DB.prepare('SELECT revision,state_json,updated_at FROM ledger WHERE workspace=?').bind(workspace).first();if(!row)return json({error:'최초 저장 전입니다.'},404);
   return json({state:JSON.parse(row.state_json),revision:row.revision,updatedAt:row.updated_at});
  }
  if(route==='state'&&request.method==='PUT'){
   const body=await limitedJson(request);validateState(body.state);
   if(![4,5,6].includes(body.state.schemaVersion)||!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<0)return json({error:'저장 형식과 버전을 확인해 주세요.'},400);
   const result=await commit(env.DB,body.expectedRevision,body.state,undefined,workspace);return json(result,result.conflict?409:200);
  }
  if(route==='state/versions'&&request.method==='GET'){
   const {results}=await env.DB.prepare('SELECT id,revision,created_at FROM ledger_versions WHERE workspace=? ORDER BY id DESC LIMIT 30').bind(workspace).all();return json({versions:results.map((r:any)=>({id:r.id,revision:r.revision,createdAt:r.created_at}))});
  }
  if(route==='state/versions'&&request.method==='POST'){
   const body=await limitedJson(request,5000);if(!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<0||!Number.isSafeInteger(body.versionId)||body.versionId<=0)return json({error:'복원 버전을 확인해 주세요.'},400);
   const result=await commit(env.DB,body.expectedRevision,null,body.versionId,workspace);return json(result,result.conflict?409:result.missing?404:200);
  }
  if(route==='files'&&request.method==='POST'){
   if(Number(request.headers.get('content-length'))>9000000)return json({error:'파일은 8MB 이하여야 합니다.'},413);
   const bytes=await request.arrayBuffer();if(bytes.byteLength>9000000)return json({error:'파일은 8MB 이하여야 합니다.'},413);
   const form=await new Response(bytes,{headers:{'content-type':request.headers.get('content-type')||''}}).formData(),file=form.get('file');if(!(file instanceof File)||file.size<=0||file.size>8000000)return json({error:'파일은 8MB 이하여야 합니다.'},400);
   const buffer=await file.arrayBuffer(),type=fileType(new Uint8Array(buffer));if(!type)return json({error:'사진 또는 PDF 파일만 보관할 수 있습니다.'},400);
   const name=file.name.replace(/[^0-9A-Za-z가-힣._-]/g,'_').replace(/\.\./g,'_').slice(-120)||'file',key=`${workspace}/${crypto.randomUUID()}-${name}`;
   await env.BUCKET.put(key,buffer,{httpMetadata:{contentType:type},customMetadata:{name:file.name,workspace}});return json({key,name:file.name,type,size:file.size,url:await signed(env,request,key)});
  }
  if(route==='files'&&request.method==='GET'){const key=url.searchParams.get('key')||'';if(!validKey(key,workspace))return json({error:'사진 키를 확인해 주세요.'},400);return json({url:await signed(env,request,key)});}
  if(route==='files/sign'&&request.method==='POST'){
   const {keys}=await limitedJson(request,20000);if(!Array.isArray(keys)||keys.length>50||!keys.every(k=>typeof k==='string'&&validKey(k,workspace)))return json({error:'사진 목록을 확인해 주세요.'},400);
   const urls:Record<string,string>={};for(const key of keys)urls[key]=await signed(env,request,key);return json({urls});
  }
  return json({error:'지원하지 않는 요청입니다.'},405);
 }catch(error){
  if(error instanceof SyntaxError)return json({error:'요청 형식을 확인해 주세요.'},400);
  const message=error instanceof Error?error.message:'';
  if(message==='too large')return json({error:'원장 용량 한도를 초과했습니다.'},413);
  if(/확인해 주세요|형식|목록|중복|상품코드|지원하지 않는 데이터/.test(message))return json({error:message},400);
  console.error('Deal Hunter storage request failed');return json({error:'서버 저장에 실패했습니다. 변경은 보존되며 다시 시도할 수 있습니다.'},503);
 }
}};
