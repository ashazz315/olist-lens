"""Register the prepared projection of verified results; no business calculation."""
import hashlib,json,pathlib,urllib.request,urllib.error,uuid,datetime
ROOT=pathlib.Path(__file__).resolve().parents[1]
cfg=json.loads((ROOT/'private/config.json').read_text(encoding='utf-8'))
base='https://'+cfg['LENS_CLOUDBASE_ENV']+'.api.tcloudbasegateway.com/v1/rdb/rest/rpc/olist_v21_'
def rpc(name,data):
    request=urllib.request.Request(base+name,data=json.dumps(data,ensure_ascii=False,separators=(',',':')).encode(),headers={'Content-Type':'application/json','Authorization':'Bearer '+cfg['LENS_DATABASE_TOKEN']})
    try:
        with urllib.request.urlopen(request,timeout=90) as response:return json.load(response)
    except urllib.error.HTTPError as error:
        raise RuntimeError('CloudBase '+str(error.code)+': '+error.read().decode()[:700]) from None
def command(op,body):return rpc('command',{'p_operation':op,'p_body':body,'p_actor':'authorized_development_baseline_reuse'})
records=[]
for entry in json.loads((ROOT/'private/baseline/manifest.json').read_text(encoding='utf-8')):
    target=pathlib.Path(entry['directory']);version=json.loads((target/'version.json').read_text(encoding='utf-8'));raw=(target/'analysis.json').read_bytes();analysis=json.loads(raw)
    if rpc('read',{'p_kind':'versions','p_id':version['id']}):
        records.append({'source':version['source'],'version':version['id'],'status':'already_registered'});continue
    version['original_revision_of']=version.get('revision_of');version['revision_of']=None
    version['baseline_reuse']={'source_result_sha256':entry['source_sha256'],'no_recalculation':True,'raw_location':'existing_protected_local_snapshot','cloud_raw_uploaded':False}
    job=str(uuid.uuid4());worker='verified-display-registration'
    command('submit',{'id':job,'source':version['source'],'request':{'mode':'reuse_existing_verified_result','source_result_sha256':entry['source_sha256'],'files':version['file_hashes']}})
    command('claim',{'id':job,'worker_id':worker})
    try:
        command('log',{'id':job,'stage':'verified_result_reuse','detail':{'engine_executed':False,'source_sha256':entry['source_sha256']}})
        command('stage',{'job_id':job,'worker_id':worker,'version':version,'analysis':analysis,'result_sha256':hashlib.sha256(raw).hexdigest(),'calculation_version':analysis.get('monitoring',{}).get('calculation_version') or version['adapter_version']})
        current=next((r for r in rpc('read',{'p_kind':'current','p_id':None}) if r['source']==version['source']),None)
        command('publish',{'id':job,'expected_current':current['version_id'] if current else None})
    except Exception as error:
        try:command('fail',{'id':job,'worker_id':worker,'error':{'stage':'verified_result_reuse','message':str(error)}})
        except Exception:pass
        raise
    record={'job':job,'source':version['source'],'version':version['id'],'status':'published_existing_result','engine_executed':False,'source_sha256':entry['source_sha256'],'bytes':len(raw),'at':datetime.datetime.now(datetime.timezone.utc).isoformat()}
    records.append(record);print(json.dumps(record),flush=True)
(ROOT/'evidence/baseline-import.json').write_text(json.dumps(records,indent=2),encoding='utf-8')
