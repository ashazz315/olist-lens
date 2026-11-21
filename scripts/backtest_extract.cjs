// Bounded IO projection only, not an independent calculator. Preserve source hash and exact fractions.
const fs=require('fs'),z=require('zlib'),c=require('crypto'),assert=require('assert/strict');
const [input,out,expected]=process.argv.slice(2),bytes=fs.readFileSync(input),hash=c.createHash('sha256').update(bytes).digest('hex');assert.equal(hash,expected);
const {operations:o}=JSON.parse(z.gunzipSync(bytes));
const compact={projection_version:2,source_sha256:hash,source_bytes:bytes.length,source_record_counts:{totals:o.verified_cube.totals.length,groups:o.verified_cube.groups.length,dimensions:Object.fromEntries(Object.entries(o.dimensions).map(([k,v])=>[k,v.length]))},field_mapping:'operations.{periods,verified_cube,delta_cents,dimensions}; dimension rows preserve key, before/after cents/units/orders and exact effects',periods:o.periods,verified_cube:o.verified_cube,delta_cents:o.delta_cents,dimensions:o.dimensions};
fs.writeFileSync(out+'.part',JSON.stringify(compact));fs.renameSync(out+'.part',out);
