'use strict';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const details=(label,value)=>'<details open><summary>'+esc(label)+'</summary><pre>'+esc(JSON.stringify(value,null,2))+'</pre></details>';
function render(report){
 const evidence=report.evidence;
 return '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>Olist Lens 调查报告</title><main>'+
  '<h1>Olist Lens 调查报告</h1><p>'+esc(report.is_synthetic?'独立模拟回放':'真实历史回放')+'</p><p>数据版本 '+esc(report.version)+'<br>快照 SHA-256 '+esc(report.snapshot_sha256)+'<br>证据 '+esc(evidence?.hash)+'</p>'+
  details('两期经营指标',report.overview.metrics)+details('商品分布与贡献',report.overview.scope)+
  (evidence?.cards||[]).map(c=>details(c.id+' '+c.label,c.value)).join('')+
  report.tasks.map(t=>details('调查与人工处理 · '+t.id,{reports:t.reports,reviews:t.reviews,actions:t.actions,executions:t.executions,verification:t.verification})).join('')+'</main></html>';
}
module.exports={render};
