'use strict';
const fs=require('node:fs'),path=require('node:path'),{sha,stable}=require('../../lib/util.cjs'),{check}=require('./cloud.cjs');
const cache=new Map();
function load(version,product,root=path.resolve(__dirname,'../private/sku-fulfillment')){
 if(version.manifest.is_synthetic!==false)return null;
 check(/^[a-f0-9]{64}$/.test(version.id),'Invalid data version');const filename=path.join(root,version.id+'.json');if(!fs.existsSync(filename))return null;
 let entry=cache.get(filename);if(!entry){const bytes=fs.readFileSync(filename),hash=sha(bytes);check(fs.readFileSync(filename.replace(/\.json$/,'.sha256'),'utf8').trim()===hash,'Fulfillment supplement integrity failed',409);const value=JSON.parse(bytes);check(value.version===version.id&&value.is_synthetic===false&&stable(value.source_hashes)===stable(version.file_hashes)&&value.shipping_sha256===version.shipping?.sha256,'Fulfillment supplement version/source mismatch',409);entry={value,hash};cache.set(filename,entry);if(cache.size>2)cache.delete(cache.keys().next().value);}
 check(stable(entry.value.source_hashes)===stable(version.file_hashes)&&entry.value.shipping_sha256===version.shipping?.sha256,'Fulfillment supplement version/source mismatch',409);
 const result=entry.value.products[product];return result?{...result,evidence:{schema:entry.value.schema,version:version.id,sha256:entry.hash,source_hashes:entry.value.source_hashes,shipping_sha256:entry.value.shipping_sha256}}:null;
}
module.exports={load};
