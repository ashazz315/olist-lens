"""Read-only byte hashes, not a data audit or metric computation."""
import hashlib
import json
from pathlib import Path
from datetime import datetime, timezone

platform = Path(__file__).resolve().parents[1]
project = platform.parents[1]
original = project.parent / 'olist-stage3'
evidence = project / 'v21/evidence'

def digest(path):
    with path.open('rb') as handle:
        return hashlib.file_digest(handle, 'sha256').hexdigest()

baseline = json.loads((evidence / 'original-files.json').read_text(encoding='utf-8-sig'))
changed = []
for item in baseline:
    target = original / item['path']
    actual = digest(target) if target.is_file() else None
    if actual != item['sha256']:
        changed.append({'path': item['path'], 'expected': item['sha256'], 'actual': actual})
frozen = []
for item in json.loads((evidence / 'protection-verification.json').read_text())['frozen_files']:
    actual = digest(project / item['path'])
    frozen.append({'path': item['path'], 'expected': item['copy_sha256'], 'actual': actual, 'unchanged': actual == item['copy_sha256']})
report = {'at': datetime.now(timezone.utc).isoformat(), 'original_files_checked': len(baseline), 'original_changes': changed, 'frozen_engines': frozen, 'passed': not changed and all(x['unchanged'] for x in frozen), 'scope': 'File bytes only; no CSV audit/calculation'}
(platform / 'evidence/protection-final.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
print(json.dumps({'original_files_checked': len(baseline), 'original_changes': len(changed), 'frozen_engines_checked': len(frozen), 'passed': report['passed']}))
raise SystemExit(0 if report['passed'] else 1)
