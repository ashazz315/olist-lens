'use strict';
const {sha}=require('../../lib/util.cjs'),{check}=require('./cloud.cjs');
class CloudFiles {
 constructor(cloud){this.cloud=cloud;this.bucket='olist-v21-private';}
 url(id){check(/^[a-f0-9]{64}$/.test(id),'Invalid object hash');return this.cloud.base+'/v1/storages/object/'+this.bucket+'/'+id;}
 async get(id){const r=await this.cloud.fetch(this.url(id),{headers:{authorization:'Bearer '+this.cloud.env.LENS_DATABASE_TOKEN},redirect:'error',signal:AbortSignal.timeout(90000)});check(r.ok,'Private file read failed: '+r.status,502);const bytes=Buffer.from(await r.arrayBuffer());check(sha(bytes)===id,'Cloud file hash mismatch',409);return bytes;}
 async put(bytes){const id=sha(bytes),r=await this.cloud.fetch(this.url(id),{method:'POST',headers:{authorization:'Bearer '+this.cloud.env.LENS_DATABASE_TOKEN,'content-type':'application/octet-stream','x-upsert':'false'},body:bytes,redirect:'error',signal:AbortSignal.timeout(90000)});if(r.status===409){check(sha(await this.get(id))===id,'Immutable object conflict',409);}else check(r.ok,'Private upload failed: '+r.status,502);return {sha256:id,size:Buffer.byteLength(bytes),object_key:this.bucket+'/'+id};}
}
module.exports={CloudFiles};
