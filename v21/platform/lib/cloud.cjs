'use strict';
const crypto=require('node:crypto');
class HttpError extends Error {constructor(status,message){super(message);this.status=status;}}
const check=(value,message,status=400)=>{if(!value)throw new HttpError(status,message);};
class Cloud {
 constructor(env=process.env,fetchFn=fetch){this.env=env;this.fetch=fetchFn;const id=env.LENS_CLOUDBASE_ENV||'sy-d2g7eacoh8e6c1fae';check(/^[a-z0-9-]+$/.test(id),'Invalid environment');this.base=`https://${id}.api.tcloudbasegateway.com`;}
 async request(route,{token,body,method='POST'}={}){const response=await this.fetch(this.base+route,{method,headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)}),redirect:'error',signal:AbortSignal.timeout(30000)});let data;try{data=await response.json();}catch{throw new HttpError(502,'CloudBase returned an invalid response');}if(!response.ok)throw new HttpError([401,403].includes(response.status)?response.status:502,'CloudBase request failed ('+response.status+'): '+String(data.error_description||data.message||data.error||'').slice(0,200));return data;}
 async login(username,password){check(typeof username==='string'&&username.length<=48&&typeof password==='string'&&password.length<=256,'Username and password required');return this.request('/auth/v1/signin',{body:{username,password}});}
 async identity(token){const value=await this.request('/auth/v1/token/introspect',{method:'GET',token});check(value?.sub,'Session expired',401);return value;}
 async membership(token){return this.request('/v1/rdb/rest/rpc/olist_v21_me',{token,body:{}});}
 async rpc(name,body){check(this.env.LENS_DATABASE_TOKEN,'Shared database service credential is not configured',503);return this.request('/v1/rdb/rest/rpc/olist_v21_'+name,{token:this.env.LENS_DATABASE_TOKEN,body});}
 read(kind,id=null){return this.rpc('read',{p_kind:kind,p_id:id});}
 schedule(value=null,actor=null){return this.rpc('replay_schedule',{p_value:value,p_actor:actor});}
 async command(operation,body,actor){if(operation==='cancel')return this.rpc('cancel',{p_id:body.id,p_actor:actor});if(operation==='ack_cancel')return this.rpc('ack_cancel',{p_id:body.id,p_worker:body.worker_id});if(operation==='recover')await this.rpc('recover_canceled',{});return this.rpc('command',{p_operation:operation,p_body:body,p_actor:actor});}
 registerFile(file){return this.rpc('file',{p_file:file});}
}
class Sessions {
 constructor(cloud){this.cloud=cloud;this.items=new Map();}
 async login(username,password){const token=await this.cloud.login(username,password);check(token.access_token,'Authentication returned no token',502);const who=await this.cloud.identity(token.access_token),member=await this.cloud.membership(token.access_token);check(member&&member.subject===who.sub&&['admin','analyst'].includes(member.role),'Account is not assigned to this Olist workspace',403);const id=crypto.randomBytes(32).toString('hex'),csrf=crypto.randomBytes(32).toString('hex');this.items.set(id,{token:token.access_token,csrf,expires:Date.now()+Math.min(Number(token.expires_in)||3600,3600)*1000});return {id,csrf,member};}
 async get(id){const s=this.items.get(id);check(s&&s.expires>Date.now(),'Please sign in',401);await this.cloud.identity(s.token);const member=await this.cloud.membership(s.token);check(member&&['admin','analyst'].includes(member.role),'Account disabled or not authorized',403);return {...s,member};}
 revoke(id){this.items.delete(id);}
}
module.exports={Cloud,Sessions,HttpError,check};
