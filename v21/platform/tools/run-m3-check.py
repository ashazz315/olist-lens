import datetime,json,os,subprocess,sys,time
from pathlib import Path
root=Path(__file__).resolve().parents[1];name=sys.argv[1]
if name not in ['m3-live.cjs','m3-browser.cjs','m3-regression']:raise ValueError('Unknown check')
node=Path.home()/'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe'
args=[str(node),'--use-env-proxy']
if name=='m3-regression':args+=['--test','--test-concurrency=1',*[str(p) for p in sorted((root/'tests').glob('*.test.cjs'))],str(root.parent/'tests/workflow.test.cjs')]
else:args+=[str(root/'tests'/name)]
start=time.time();p=subprocess.Popen(args,cwd=root,stdout=subprocess.PIPE,stderr=subprocess.PIPE,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0));out,err=p.communicate(timeout=300)
r={'command':args,'pid':p.pid,'exit_code':p.returncode,'exit_hex':hex(p.returncode&0xffffffff),'seconds':time.time()-start,'stdout':out.decode('utf8',errors='replace'),'stderr':err.decode('utf8',errors='replace')};dest=root/'evidence'/('m3-run-'+name+'-'+datetime.datetime.now().strftime('%H%M%S')+'.json');dest.write_text(json.dumps(r,ensure_ascii=False,indent=2),encoding='utf8');print(json.dumps({'receipt':str(dest),**r},ensure_ascii=True));sys.exit(0 if p.returncode==0 else 1)
