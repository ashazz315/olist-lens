"""Reuse reviewed M1 transaction bodies in a separate synthetic-only schema.
Does not modify or execute any existing migration. Run once to create new SQL.
"""
from pathlib import Path
p = Path(__file__).resolve().parents[1] / 'cloudbase/migrations'
sql = """-- M2 simulated scenarios only. No Olist/business table mutation.
CREATE SCHEMA olist_v21_sim;
REVOKE ALL ON SCHEMA olist_v21_sim FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SCHEMA olist_v21_sim TO service_role;
"""
for table in ['files','jobs','job_logs','metric_snapshots','current_versions','alerts','investigations','audit_logs']:
    sql += f'CREATE TABLE olist_v21_sim.{table} (LIKE olist_v21.{table} INCLUDING ALL);\n'
sql += """
CREATE TABLE olist_v21_sim.versions (
 id text PRIMARY KEY CHECK(id ~ '^[a-f0-9]{64}$'),source text NOT NULL CHECK(source='olist'),
 content jsonb NOT NULL,manifest jsonb NOT NULL,file_hashes jsonb NOT NULL,
 quality text NOT NULL CHECK(quality='verified'),revision_of text,created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(manifest->>'is_synthetic' IS NOT DISTINCT FROM 'true'),
 CHECK(manifest->>'scenario_id'='gmv-drop-lab-v1')
);
ALTER TABLE olist_v21_sim.metric_snapshots ADD FOREIGN KEY(version_id) REFERENCES olist_v21_sim.versions(id);
ALTER TABLE olist_v21_sim.current_versions ADD FOREIGN KEY(version_id) REFERENCES olist_v21_sim.versions(id);
ALTER TABLE olist_v21_sim.investigations ADD FOREIGN KEY(version_id) REFERENCES olist_v21_sim.versions(id);
ALTER TABLE olist_v21_sim.job_logs ADD FOREIGN KEY(job_id) REFERENCES olist_v21_sim.jobs(id);
"""
for table in ['files','jobs','job_logs','metric_snapshots','current_versions','alerts','investigations','audit_logs','versions']:
    sql += f'ALTER TABLE olist_v21_sim.{table} ENABLE ROW LEVEL SECURITY;\nREVOKE ALL ON olist_v21_sim.{table} FROM anon,authenticated;\n'
for table in ['files','versions','metric_snapshots','job_logs','audit_logs']:
    sql += f'CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON olist_v21_sim.{table} FOR EACH ROW EXECUTE FUNCTION olist_v21.immutable();\n'

original=(p/'20261115120000_olist_platform.sql').read_text()
read=original[original.index('CREATE FUNCTION public.olist_v21_read'):original.index('CREATE FUNCTION public.olist_v21_command')]
read='\n'.join(line for line in read.splitlines() if not any("WHEN '"+kind+"'" in line for kind in ['users','sources','settings']))
command=(p/'20261115121000_publish_qualification.sql').read_text()
command=command[:command.index(" WHEN 'user' THEN")]+command[command.index(" ELSE RAISE EXCEPTION 'Unknown command'"):]
command=command.replace("rowdata->'manifest'->>'is_synthetic' IS DISTINCT FROM 'false'", "rowdata->'manifest'->>'is_synthetic' IS DISTINCT FROM 'true'")
command=command.replace("rowdata=p_body->'version';", "rowdata=p_body->'version'; IF rowdata->'manifest'->>'scenario_id' IS DISTINCT FROM 'gmv-drop-lab-v1' OR p_body->'analysis'->'simulation'->>'is_synthetic' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Synthetic scenario boundary failed'; END IF;")
# Same source namespace is retained inside the separate schema so M1 transaction
# gates and unchanged operations/monitoring contracts remain reusable.
cancel=(p/'20261115124000_cancellation_marker.sql').read_text()
cancel='\n'.join(line for line in cancel.splitlines() if not line.startswith('ALTER TABLE')) # column cloned from M1
file=(p/'20261115122000_private_files.sql').read_text().replace('olist-v21-private','olist-v21-simulated')
sql += ('\n'+read+'\n'+command+'\n'+cancel+'\n'+file).replace('olist_v21.','olist_v21_sim.').replace('public.olist_v21_','public.olist_v21_sim_').replace('pg_catalog,olist_v21','pg_catalog,olist_v21_sim')
sql += """
REVOKE ALL ON FUNCTION public.olist_v21_sim_read(text,text), public.olist_v21_sim_command(text,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.olist_v21_sim_read(text,text), public.olist_v21_sim_command(text,jsonb,text) TO service_role;
"""
(p/'20261115140000_isolated_scenarios.sql').write_text(sql,encoding='utf-8')
print('Created isolated scenario migration; existing files untouched')
