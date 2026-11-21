"""Local Stage 3 safety and provenance helpers. No publication side effects."""
import hashlib
import json
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PROTECTED = [ROOT / p for p in ('output/analysis', 'output/templates', 'output/pdf', 'cloud/dist', 'data/canonical')]

def sha(path):
    h = hashlib.sha256()
    with Path(path).open('rb') as f:
        for block in iter(lambda: f.read(1024 * 1024), b''): h.update(block)
    return h.hexdigest()

def now(): return datetime.now(timezone.utc).isoformat()
def run_id(): return datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S') + '-' + uuid.uuid4().hex[:12]
def load(path): return json.loads(Path(path).read_text(encoding='utf-8-sig'))

def safe_output(path, inputs=()):
    p = Path(path).resolve()
    for denied in PROTECTED + [Path(x).resolve() for x in inputs]:
        if p == denied or denied in p.parents:
            raise ValueError('Output overlaps protected/input path: ' + str(p))
    return p

def fresh_dir(path, inputs=()):
    p = safe_output(path, inputs)
    if p.exists() and any(p.iterdir()): raise FileExistsError('Output exists; choose a new run directory: ' + str(p))
    p.mkdir(parents=True, exist_ok=True)
    return p

def write_json(path, value):
    p = Path(path); p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_name(p.name + '.' + uuid.uuid4().hex + '.part')
    payload=(json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + '\n').encode('utf-8')
    with tmp.open('wb') as f:
        f.write(payload);f.flush();os.fsync(f.fileno())
    if tmp.read_bytes()!=payload:raise OSError('JSON write/readback mismatch; prior target preserved')
    os.replace(tmp, p)
    if p.read_bytes()!=payload:raise OSError('JSON committed readback mismatch: '+str(p))

def copy_verified(source,target):
    """Explicit durable copy with readback; no changes to the source."""
    source=Path(source);target=Path(target)
    if source.is_dir():
        target.mkdir(parents=True,exist_ok=True)
        for p in source.iterdir():copy_verified(p,target/p.name)
        return
    target.parent.mkdir(parents=True,exist_ok=True);payload=source.read_bytes();tmp=target.with_name(target.name+'.'+uuid.uuid4().hex+'.part')
    with tmp.open('wb') as f:f.write(payload);f.flush();os.fsync(f.fileno())
    if tmp.read_bytes()!=payload:raise OSError('Copy readback mismatch; target not committed')
    os.replace(tmp,target)
    if sha(target)!=hashlib.sha256(payload).hexdigest():raise OSError('Committed copy differs from source')
