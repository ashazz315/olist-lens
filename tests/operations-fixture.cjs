// SYNTHETIC TEST DATA ONLY. No Olist business observations or achieved outcomes.
const Core=require('../cloud/dist/core.js'),Papa=require('../cloud/dist/vendor/papaparse.min.js');
function fixture(){
 const manifest={schema_version:'1.0.0',dataset_name:'合成测试样本 / Synthetic operations fixture',source_uri_or_description:'Synthetic test only; not real Olist data',is_synthetic:true,extracted_at:'2026-11-13T12:00:00Z',coverage_start:'2020-01-06',coverage_end:'2020-02-16',currency:'BRL',source_timezone:'source_local_unknown',import_mode:'full_snapshot',license_or_usage_notes:'Synthetic test only',operations:{before:{start:'2020-02-03',end:'2020-02-10'},after:{start:'2020-02-10',end:'2020-02-17'},complete_through:'2020-02-16',completion_evidence:'Synthetic fixture generator specifies all six complete weeks; not a business certification',min_orders:1,min_product_orders:1,baseline_periods:4,thresholds:{absolute_cents:100,relative:0.1,mad_multiplier:3}}};
 const rows={orders:[],order_items:[],order_reviews:[]};
 const add=(id,date,status,items)=>{rows.orders.push([id,'customer-'+id,'SP',status,date+' 08:00:00',status==='delivered'?date+' 18:00:00':'',date+' 00:00:00']);items.forEach(([product,price,seller='S1',category='cat'],n)=>rows.order_items.push([id,String(n+1),product,seller,category,price,'0']));};
 for(const date of ['2020-01-06','2020-01-13','2020-01-20','2020-01-27'])add('H'+date,date,'delivered',[['P1','10.00']]);
 add('B1','2020-02-03','delivered',[['P1','10.00'],['P1','10.00'],['OLD','5.00']]);
 add('A1','2020-02-10','shipped',[['P1','20.00'],['P1','20.00'],['P1','20.00'],['NEW','7.00']]);
 for(const [index,status]of ['created','canceled','unavailable'].entries())add('X'+index,'2020-02-11',status,[['X','999.00']]);
 rows.order_reviews.push(['R1','B1','1','2020-02-04 00:00:00','2020-02-04 09:00:00'],['R2','B1','5','2020-02-05 00:00:00','2020-02-05 09:00:00']);
 return {rows,manifest};
}
const files=rows=>Object.fromEntries(Object.entries(rows).map(([k,v])=>[k+'.csv',Papa.unparse({fields:Core.fields[k],data:v})]));
module.exports={fixture,files};
if(require.main===module){const fs=require('node:fs'),path=require('node:path'),out=path.resolve(process.argv[2]||'tmp/operations-fixture'),f=fixture();fs.mkdirSync(out,{recursive:true});for(const [k,v]of Object.entries(files(f.rows)))fs.writeFileSync(path.join(out,k),v);fs.writeFileSync(path.join(out,'dataset_manifest.json'),JSON.stringify(f.manifest,null,2));console.log(out);}
