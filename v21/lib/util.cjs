'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const load=p=>JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,''));
const now=()=>new Date().toISOString();
const stable=x=>JSON.stringify(x,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
function need(v,message){if(!v)throw Error(message);}
function decimal(v){need(typeof v==='string'&&/^-?\d+(\.\d{1,4})?$/.test(v),'Invalid decimal: '+v);const neg=v.startsWith('-'),[a,b='']=v.replace(/^-/,'').split('.');return ((neg?-1n:1n)*(BigInt(a)*10000n+BigInt(b.padEnd(4,'0')))).toString();}
function date(v){need(typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v,'Invalid calendar date');return v;}
function writeNew(p,data){fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,data,{flag:'wx'});}
module.exports={sha,load,now,stable,need,decimal,date,writeNew};
