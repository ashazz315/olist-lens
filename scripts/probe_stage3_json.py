"""Read-only runtime probe of prior original evidence. No repair or suppression."""
import argparse,gzip,json,platform,sys,time,tracemalloc
from pathlib import Path
from stage3_io import sha,write_json,now

def main():
    p=argparse.ArgumentParser();p.add_argument('--source',type=Path,required=True);p.add_argument('--out',type=Path,required=True);p.add_argument('--repeats',type=int,default=5);a=p.parse_args()
    digest=sha(a.source);tracemalloc.start();records=[]
    for i in range(a.repeats):
        tick=time.perf_counter()
        with gzip.open(a.source,'rt',encoding='utf-8') as f:r=json.load(f)
        records.append(dict(iteration=i+1,elapsed_seconds=time.perf_counter()-tick,product_rows=len(r['operations']['dimensions']['product']),evaluation_rows=len(r['monitoring']['evaluations']),python_tracemalloc_peak_bytes=tracemalloc.get_traced_memory()[1]))
        del r
    assert sha(a.source)==digest
    write_json(a.out,dict(status='passed',source=str(a.source),source_sha256=digest,python=sys.version,executable=sys.executable,platform=platform.platform(),completed_at=now(),records=records,interpretation='Successful controlled read does not establish the root cause of prior access violations.'))
    print({'status':'passed','repeats':len(records),'peak_bytes':max(r['python_tracemalloc_peak_bytes'] for r in records)})
if __name__=='__main__':main()
