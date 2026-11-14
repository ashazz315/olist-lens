/* Browser presentation for an immutable evidence run; review records remain local. */
'use strict';
(()=>{
 let pack=null,draft=null,reviewRecord=null,viewToken=0,persistQueue=Promise.resolve();
 const q=s=>document.querySelector(s),fmt=n=>n==null?'不适用':new Intl.NumberFormat('zh-CN',{maximumFractionDigits:2}).format(n/100);
 const reasons={low_sample:'两期订单样本不足',low_historical_sample:'历史期间样本不足',insufficient_historical_coverage:'完整历史基线不足',zero_baseline_amount:'基期金额为零',missing_product_id:'商品标识缺失',missing_operations_config:'未提供经营配置',missing_completeness_evidence:'未提供完整性证据',incomplete_period:'期间不完整',non_comparable_windows:'期间不满足相邻等长整周要求',purchase_order_missing_items:'购买订单缺少商品明细',independent_verification_failed:'SQL 与独立复算不一致',low_sample_product:'商品样本不足'};
 const flags={low_sample:'低样本',missing_dimension:'维度缺失',multiple_categories:'跨品类映射'};
 const note=s=>{q('#ops-review-status').textContent=s;};
 function renderRows(){
  const dimension=q('#ops-dimension').value,rows=pack?.dimensions?.[dimension]||[];
  q('#ops-table-note').textContent=`按变化绝对金额排序，显示前 ${Math.min(rows.length,100)} / ${rows.length} 组；导出包含全部组。金额单位：${current.manifest.currency}。分解不代表因果；新/消失商品不估算缺期价格。`;
  q('#ops-rows').innerHTML=rows.slice(0,100).map((r,i)=>`<tr><td>${esc(r.key??'未标注')}</td><td>${fmt(r.before.amount_cents)}</td><td>${fmt(r.after.amount_cents)}</td><td>${fmt(r.delta_cents)}</td><td>${fmt(r.quantity_effect?.value_cents)}</td><td>${fmt(r.price_effect?.value_cents)}</td><td>${fmt(r.assortment_effect_cents)}</td><td>${esc(r.flags.map(f=>flags[f]||f).join('；'))}<button class="button ghost" data-ops-evidence="${i}">查看证据</button></td></tr>`).join('');
  document.querySelectorAll('[data-ops-evidence]').forEach(button=>button.onclick=()=>{const r=rows[Number(button.dataset.opsEvidence)];q('#ops-evidence').textContent=JSON.stringify(pack.evidence.find(e=>e.id===r.evidence_id),null,2);q('#ops-evidence').parentElement.open=true;});
 }
 window.renderOperations=r=>{
  pack=r.operations||null;draft=null;reviewRecord=null;viewToken++;q('#ops-answer').textContent='';note('');q('#ops-evidence').textContent='点击表格中的证据按钮。';
  q('#ops-export').disabled=!pack;q('#ops-metrics').innerHTML='';q('#ops-alerts').textContent='';
  if(!pack){q('#ops-summary').textContent='证据不足：该历史版本未包含经营分析运行。请导入完整商品明细与经营配置；不能从旧汇总报告还原商品变化。';renderRows();return;}
  const status={blocked:'阻断',insufficient_evidence:'证据不足，未发告警',verified:'计算已验证，根因待复核'}[pack.status]||pack.status;
  q('#ops-summary').innerHTML=`<p><b>${esc(status)}</b>${pack.is_synthetic===true?' · 合成测试样本，不是真实经营结果':''}</p><p>${esc([...(pack.gates||[]),...(pack.detection?.reasons||[])].map(x=>reasons[x]||x).join('；'))}</p>${pack.config?`<p>基期 ${esc(pack.config.before.start)} 至 ${esc(pack.config.before.end)}（不含结束日）；当期 ${esc(pack.config.after.start)} 至 ${esc(pack.config.after.end)}（不含结束日）。</p>`:''}`;
  if(pack.metrics){const m=pack.metrics;const cards=[['当期购买订单商品金额',fmt(m.after.purchase_item_amount_cents)+' '+r.manifest.currency,'基期 '+fmt(m.before.purchase_item_amount_cents)],['订单 / 商品件数',`${m.after.purchase_orders} / ${m.after.item_units}`,'按购买时间与状态过滤'],['订单平均商品金额',fmt(m.after.avg_order_item_amount_cents),'分母：合格购买订单'],['商品金额变化',fmt(pack.delta_cents),pack.metrics.after.late_rate===null?'履约延迟率：不适用':'当期履约延迟率 '+(pack.metrics.after.late_rate*100).toFixed(2)+'%']];q('#ops-metrics').innerHTML=cards.map(([title,value,sub])=>`<div class="metric"><div class="metric-label">${esc(title)}</div><div class="metric-value">${esc(value)}</div><small>${esc(sub)}</small></div>`).join('');}
  q('#ops-alerts').innerHTML=`<p>候选告警 ${pack.alerts.length} 条。${pack.alerts.length?'需要人工审核；不代表根因已确认。':'未满足全部告警条件，或证据不足。'}</p><p class="small">运行 ${esc(pack.run_id||'失败')} · ${esc(pack.calculation_version||'未知版本')}</p>${(pack.alerts||[]).map(a=>`<p>${esc(a.metric_id)}：变化 ${fmt(a.delta_cents)}，处理状态 ${esc(a.status)}</p>`).join('')}<p class="small">本地运行记录随完整快照保存；没有后台采集或定时任务。</p>`;
  renderRows();
  if(database&&pack.run_id){const token=viewToken;getValue('settings','ops-review:'+pack.run_id).then(saved=>{if(token===viewToken&&saved?.evidence_hash===pack.evidence_hash){reviewRecord=saved;draft=saved.draft;note('已保存人工审核：'+saved.decision+' · '+saved.reviewer);}}).catch(e=>note('审核记录读取失败：'+e.message));}
 };
 function saveRecord(key,value,expectedRun){
  const result=persistQueue.then(()=>persistRecord(key,value,expectedRun));
  persistQueue=result.catch(()=>{});return result;
 }
 async function persistRecord(key,value,expectedRun){
  if(!database)throw Error('本机存储不可用');
  if(current.operations?.run_id!==expectedRun)throw Error('数据版本已切换，请重新复核');
  const saved=await getValue('snapshots',current.id);if(!saved)throw Error('请先确认保存完整快照');
  if(current.operations?.run_id!==expectedRun)throw Error('数据版本已切换，请重新复核');
  if(key.startsWith('ops-review:')){saved.result.operations.alerts.forEach(a=>{a.status=value.decision;});saved.result.operations.human_review=value;}
  else if(key.startsWith('ops-answer:')){const sessions=saved.result.operations.diagnosis_sessions||[];saved.result.operations.diagnosis_sessions=[...sessions.filter(s=>s.id!==value.id),value];}
  else saved.result.operations.action_sheet=value;
  await new Promise((resolve,reject)=>{const tx=database.transaction(['settings','snapshots'],'readwrite');tx.objectStore('settings').put(value,key);tx.objectStore('snapshots').put(saved);tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error||Error('保存失败'));tx.onerror=()=>{};});
  if(current.operations?.run_id===expectedRun){current.operations=saved.result.operations;pack=current.operations;}
 }
 q('#ops-dimension').onchange=renderRows;
 q('#ops-export').onclick=()=>{if(pack)download('operations-evidence-'+(pack.run_id||'blocked')+'.json',JSON.stringify(pack,null,2));};
 q('#ops-question-form').onsubmit=async e=>{e.preventDefault();const question=q('#ops-question').value,answer=LensOperations.answer(pack,question),run=pack?.run_id;draft=answer;reviewRecord=null;q('#ops-answer').textContent=answer.answer+'\n'+(answer.evidence_ids?.length?'引用：'+answer.evidence_ids.join('、'):'');note('新的回答需要重新人工审核。');if(run)try{const id=await LensOperations.hash({run_id:run,question,answer});await saveRecord('ops-answer:'+id,{id,question,answer,recorded_at:new Date().toISOString()},run);}catch(err){note('回答审计记录保存失败：'+err.message);}};
 q('#ops-review-form').onsubmit=async e=>{e.preventDefault();try{if(!draft)throw Error('请先查看证据回答');const run=pack.run_id,record=LensOperations.review(pack,draft,{reviewer:q('#ops-reviewer').value,decision:q('#ops-decision').value,note:q('#ops-review-note').value});await saveRecord('ops-review:'+run,record,run);if(pack.run_id===run){reviewRecord=record;note('人工审核已保存：'+record.decision+'；执行与收益尚未验证。');q('#ops-alerts').textContent='告警处理状态：'+record.decision+' · 审阅人 '+record.reviewer;}}catch(err){note(err.message);}};
 q('#ops-action-form').onsubmit=async e=>{e.preventDefault();try{const run=pack?.run_id,sheet=LensOperations.action(pack,reviewRecord,{owner:q('#ops-owner').value,task:q('#ops-task').value});await saveRecord('ops-action:'+run,sheet,run);download('operations-action-'+run+'.json',JSON.stringify(sheet,null,2));note('正式行动单已保存并导出。执行状态待处理，业务结果未验证。');}catch(err){note(err.message);}};
})();
