"""Local-only source checkpoint inventory. No data audit, computation or remote Git."""
import hashlib,json,re,subprocess,sys
from pathlib import Path
root=Path(__file__).resolve().parents[3];workspace=root.parents[1];original=root.parent/'olist-stage3';out=root/'v21/platform/evidence/handoff-20261115';out.mkdir(exist_ok=True,parents=True)
def git(where,*args):return subprocess.check_output(['git','-c','safe.directory='+where.as_posix(),'-C',str(where),*args],text=True,encoding='utf8')
skip={'private','runtime','evidence','output','outputs','data','external_staging','.tools','.npm-cache','node_modules','__pycache__','.git'}
extensions={'.md','.js','.cjs','.mjs','.py','.ps1','.sql','.html','.css','.svg','.wasm','.txt'}
files=[]
for folder in ['docs','scripts','tests','cloud/dist','v21']:
    for f in (root/folder).rglob('*'):
        rel=f.relative_to(root)
        if not f.is_file() or any(x in skip for x in rel.parts) or f.name=='snapshot.js':continue
        if f.suffix in extensions or f.name=='.gitignore' or f.name.endswith('-LICENSE') or (f.suffix=='.json' and ('contracts' in rel.parts or f.name in ['package.json','package-lock.json','dependencies.json'])):files.append(rel.as_posix())
files += [f.name for f in root.iterdir() if f.is_file() and (f.suffix in {'.md','.ps1'} or f.name in ['.gitignore','.gitattributes','package.json','package-lock.json','requirements-report.txt'])]
files=sorted(set(files));secrets=[]
config=json.loads((root/'v21/platform/private/config.json').read_text(encoding='utf8'))
for k in ['LENS_DATABASE_TOKEN','LENS_SECRET_KEY']:
    if config.get(k):secrets.append(config[k])
account=json.loads((root/'v21/platform/private/initial-admin.json').read_text(encoding='utf8'));secrets.append(account['password'])
findings=[];manifest=[]
for name in files:
    b=(root/name).read_bytes();text=b.decode('utf8',errors='replace')
    if any(s and s in text for s in secrets) or re.search(r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bsk-[A-Za-z0-9_-]{24,}',text):findings.append(name)
    manifest.append({'path':name,'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()})
if findings:raise SystemExit('Secret review required in: '+', '.join(findings))
private=root/'v21/platform/private/handoff-preservation';private.mkdir(exist_ok=True)
status=git(original,'status','--porcelain=v1');(private/'original-status.txt').write_text(status,encoding='utf8');patch=git(original,'diff','--binary');(private/'original-working-tree.patch').write_text(patch,encoding='utf8')
untracked=git(original,'ls-files','--others','--exclude-standard').splitlines();preserved=[]
for name in untracked:
    f=original/name;parts=Path(name).parts
    if parts[0] in ['docs','scripts','tests'] and f.is_file() and f.suffix in extensions:
        target=private/'untracked-source'/name;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(f.read_bytes());preserved.append(name)
record={'source_root':str(root),'original_branch':git(original,'branch','--show-current').strip(),'original_head':git(original,'rev-parse','HEAD').strip(),'original_status':status.splitlines(),'preserved_untracked_source_files':preserved,'review':'source/docs allowlist; known credentials and private-key/token pattern scan; not a full security audit','excluded':'private/config/accounts/.env/raw data/runtime/evidence/dependencies/derived snapshot','files':manifest,'secret_findings':findings}
(out/'checkpoint-inventory.json').write_text(json.dumps(record,ensure_ascii=False,indent=2),encoding='utf8')
(private/'git-source-paths.txt').write_text('\n'.join(files)+'\n',encoding='utf8')
print(json.dumps({'source_files':len(files),'bytes':sum(x['bytes'] for x in manifest),'secret_findings':len(findings),'original_branch':record['original_branch'],'untracked_source_preserved':len(preserved)}))
if '--commit' in sys.argv:
    branch='checkpoint/v2.1-m3-handoff-20261115'
    if not (root/'.git').exists():subprocess.run(['git','init','-b',branch,str(root)],check=True,stdout=subprocess.DEVNULL)
    if git(root,'branch','--show-current').strip()!=branch:raise SystemExit('Unexpected checkpoint branch; do not overwrite')
    (root/'.git/info/exclude').write_text('\n'.join(['**/private/','**/runtime/','**/evidence/','**/.tools/','**/.npm-cache/','**/node_modules/','**/__pycache__/','**/.env','**/.env.*','**/data/','**/external_staging/','**/output/','**/outputs/','cloud/dist/snapshot.js','*.csv','*.sqlite','*.db','*.zip','*.pdf','*.xlsx'])+'\n',encoding='utf8')
    git(root,'add','--pathspec-from-file='+str(private/'git-source-paths.txt'))
    git(root,'add','--renormalize','--pathspec-from-file='+str(private/'git-source-paths.txt'))
    staged=git(root,'diff','--cached','--name-only').splitlines();assert set(staged)<=set(files)
    if staged:git(root,'-c','user.name=Olist local checkpoint','-c','user.email=local-checkpoint@localhost','commit','-m','Local v2.1 M3 handoff checkpoint; incomplete release, no secrets or raw data')
    marker='checkpoint/stage3-preserved-20261115'
    if not git(original,'branch','--list',marker).strip():git(original,'branch',marker,'HEAD')
    result={'branch':branch,'commit':git(root,'rev-parse','HEAD').strip(),'files':len(git(root,'ls-files').splitlines()),'remote_count':len(git(root,'remote').splitlines()),'original_checkpoint_branch':marker,'original_worktree_preserved':True}
    (out/'checkpoint-result.json').write_text(json.dumps(result,indent=2),encoding='utf8');print(json.dumps(result))
