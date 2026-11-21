// Read-only comparison of saved projections to their original gzip, not a calculator.
const fs=require('fs'),path=require('path'),z=require('zlib'),c=require('crypto'),assert=require('assert/strict');
const [base,output]=process.argv.slice(2);const records=[];
for(const gzipName of fs.readdirSync(path.join(base,'runs')).filter(x=>x.endsWith('.json.gz'))){
 const file=gzipName.slice(0,-3),target=path.join(base,'independent-inputs',file);
 const b=fs.readFileSync(path.join(base,'runs',gzipName)),source=c.createHash('sha256').update(b).digest('hex'),o=JSON.parse(z.gunzipSync(b)).operations;
 if(!fs.existsSync(target)){
  const p={projection_version:2,source_sha256:source,source_bytes:b.length,source_record_counts:{totals:o.verified_cube.totals.length,groups:o.verified_cube.groups.length,dimensions:Object.fromEntries(Object.entries(o.dimensions).map(([k,v])=>[k,v.length]))},field_mapping:'operations.{periods,verified_cube,delta_cents,dimensions}; lossless IO projection only; no independent calculation',periods:o.periods,verified_cube:o.verified_cube,delta_cents:o.delta_cents,dimensions:o.dimensions};
  fs.writeFileSync(target+'.part',JSON.stringify(p));fs.renameSync(target+'.part',target);
 }
 const p=JSON.parse(fs.readFileSync(target,'utf8'));
 assert.equal(p.source_sha256,source);assert.deepEqual(p.verified_cube,o.verified_cube,file);assert.deepEqual(p.dimensions,o.dimensions,file);assert.deepEqual(p.periods,o.periods,file);assert.equal(p.delta_cents,o.delta_cents,file);
 for(const g of p.verified_cube.groups)assert.deepEqual(Object.keys(g).sort(),['amount_cents','dimension','key','orders','period','units'],file);
 records.push({window:file.slice(0,-5),groups:p.verified_cube.groups.length,product_rows:p.dimensions.product.length,source_sha256:source,compact_sha256:c.createHash('sha256').update(fs.readFileSync(path.join(base,'independent-inputs',file))).digest('hex'),matches:true});
}
fs.writeFileSync(output,JSON.stringify({status:'passed',checked_at:new Date().toISOString(),node:process.version,records},null,2));console.log({status:'passed',files:records.length});
