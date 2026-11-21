"""Serial Node 24 browser runner retaining native exit/stdout/stderr evidence."""
import json
import subprocess
import sys
import time
from pathlib import Path
from datetime import datetime, timezone

platform=Path(__file__).resolve().parents[1]
name=sys.argv[1]
if name not in ['m2-live-browser.cjs','browser-platform.cjs']:
    raise SystemExit('Unsupported test')
node=Path.home()/'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe'
script=platform/'tests'/name
command=[str(node),'--use-env-proxy',str(script)]
started=time.monotonic()
process=subprocess.Popen(command,cwd=str(platform),stdout=subprocess.PIPE,stderr=subprocess.PIPE)
try:
    stdout,stderr=process.communicate(timeout=150)
except subprocess.TimeoutExpired:
    process.kill()
    stdout,stderr=process.communicate()
receipt={'at':datetime.now(timezone.utc).isoformat(),'command':command,'pid':process.pid,'seconds':round(time.monotonic()-started,3),'exit_code':process.returncode,'exit_hex':hex(process.returncode&0xffffffff),'stdout':stdout.decode('utf-8',errors='replace'),'stderr':stderr.decode('utf-8',errors='replace')}
target=platform/'evidence'/('runner-'+name+'-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S')+'.json')
target.write_text(json.dumps(receipt,indent=2,ensure_ascii=False),encoding='utf-8')
print(json.dumps({'receipt':str(target),**receipt},ensure_ascii=True))
raise SystemExit(0 if process.returncode==0 else 1)
