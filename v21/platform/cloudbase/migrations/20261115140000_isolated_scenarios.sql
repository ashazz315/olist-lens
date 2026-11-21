-- M2 simulated scenarios only. No Olist/business table mutation.
CREATE SCHEMA olist_v21_sim;
REVOKE ALL ON SCHEMA olist_v21_sim FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SCHEMA olist_v21_sim TO service_role;
CREATE TABLE olist_v21_sim.files (LIKE olist_v21.files INCLUDING ALL);
CREATE TABLE olist_v21_sim.jobs (LIKE olist_v21.jobs INCLUDING ALL);
CREATE TABLE olist_v21_sim.job_logs (LIKE olist_v21.job_logs INCLUDING ALL);
CREATE TABLE olist_v21_sim.metric_snapshots (LIKE olist_v21.metric_snapshots INCLUDING ALL);
CREATE TABLE olist_v21_sim.current_versions (LIKE olist_v21.current_versions INCLUDING ALL);
CREATE TABLE olist_v21_sim.alerts (LIKE olist_v21.alerts INCLUDING ALL);
CREATE TABLE olist_v21_sim.investigations (LIKE olist_v21.investigations INCLUDING ALL);
CREATE TABLE olist_v21_sim.audit_logs (LIKE olist_v21.audit_logs INCLUDING ALL);

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
ALTER TABLE olist_v21_sim.files ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON olist_v21_sim.files FROM anon,authenticated;
ALTER TABLE olist_v21_sim.jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON olist_v21_sim.jobs FROM anon,authenticated;
ALTER TABLE olist_v21_sim.job_logs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON olist_v21_sim.job_logs FROM anon,authenticated;
ALTER TABLE olist_v21_sim.metric_snapshots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON olist_v21_sim.metric_snapshots FROM anon,authenticated;
ALTER TABLE olist_v21_sim.current_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON olist_v21_sim.current_versions FROM anon,authenticated;
ALTER TABLE olist_v21_sim.alerts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON olist_v21_sim.alerts FROM anon,authenticated;
ALTER TABLE olist_v21_sim.investigations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON olist_v21_sim.investigations FROM anon,authenticated;
ALTER TABLE olist_v21_sim.audit_logs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON olist_v21_sim.audit_logs FROM anon,authenticated;
ALTER TABLE olist_v21_sim.versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON olist_v21_sim.versions FROM anon,authenticated;
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON olist_v21_sim.files FOR EACH ROW EXECUTE FUNCTION olist_v21.immutable();
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON olist_v21_sim.versions FOR EACH ROW EXECUTE FUNCTION olist_v21.immutable();
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON olist_v21_sim.metric_snapshots FOR EACH ROW EXECUTE FUNCTION olist_v21.immutable();
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON olist_v21_sim.job_logs FOR EACH ROW EXECUTE FUNCTION olist_v21.immutable();
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON olist_v21_sim.audit_logs FOR EACH ROW EXECUTE FUNCTION olist_v21.immutable();

CREATE FUNCTION public.olist_v21_sim_read(p_kind text,p_id text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,olist_v21_sim AS $$
DECLARE result jsonb;
BEGIN
 CASE p_kind
 WHEN 'jobs' THEN SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.created_at DESC),'[]') INTO result FROM olist_v21_sim.jobs t WHERE p_id IS NULL OR t.id::text=p_id;
 WHEN 'logs' THEN SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY seq),'[]') INTO result FROM olist_v21_sim.job_logs t WHERE job_id::text=p_id;
 WHEN 'versions' THEN SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY created_at DESC),'[]') INTO result FROM olist_v21_sim.versions t WHERE p_id IS NULL OR id=p_id;
 WHEN 'current' THEN SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]') INTO result FROM olist_v21_sim.current_versions t;
 WHEN 'snapshots' THEN SELECT to_jsonb(t) INTO result FROM olist_v21_sim.metric_snapshots t WHERE version_id=p_id;
 WHEN 'alerts' THEN SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]') INTO result FROM olist_v21_sim.alerts t WHERE p_id IS NULL OR version_id=p_id;
 WHEN 'tasks' THEN SELECT coalesce(jsonb_agg(value ORDER BY updated_at DESC),'[]') INTO result FROM olist_v21_sim.investigations WHERE p_id IS NULL OR id::text=p_id;
 WHEN 'audit' THEN SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]') INTO result FROM (SELECT * FROM olist_v21_sim.audit_logs ORDER BY seq DESC LIMIT 200) t;
 ELSE RAISE EXCEPTION 'Unknown read kind';
 END CASE; RETURN result;
END $$;

-- Correct the newly added platform publication function; original engine unchanged.
CREATE OR REPLACE FUNCTION public.olist_v21_sim_command(p_operation text,p_body jsonb,p_actor text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,olist_v21_sim AS $$
DECLARE j olist_v21_sim.jobs; v olist_v21_sim.versions; c olist_v21_sim.current_versions; oldtask olist_v21_sim.investigations;
 result jsonb; rowdata jsonb; new_id uuid; oldrole text;
BEGIN
 IF p_actor IS NULL OR length(trim(p_actor))=0 THEN RAISE EXCEPTION 'Actor required'; END IF;
 CASE p_operation
 WHEN 'submit' THEN
   new_id=(p_body->>'id')::uuid;
   IF p_body->>'source'='ga4' THEN RAISE EXCEPTION 'GA4 authorization required'; END IF;
   IF p_body->>'retry_of' IS NOT NULL THEN
     SELECT * INTO j FROM olist_v21_sim.jobs WHERE id=(p_body->>'retry_of')::uuid FOR UPDATE;
     IF j.id IS NULL OR j.source<>p_body->>'source' OR j.status NOT IN ('failed','interrupted','canceled') OR j.request<>p_body->'request' THEN RAISE EXCEPTION 'Invalid retry'; END IF;
   END IF;
   INSERT INTO olist_v21_sim.jobs(id,source,status,request,retry_of,actor) VALUES(new_id,p_body->>'source','queued',p_body->'request',(p_body->>'retry_of')::uuid,p_actor) RETURNING * INTO j;
   result=to_jsonb(j);
 WHEN 'claim' THEN
   UPDATE olist_v21_sim.jobs SET status='running',worker_id=p_body->>'worker_id',lease_until=now()+interval '5 minutes',started_at=now(),revision=revision+1
   WHERE id=(p_body->>'id')::uuid AND status='queued' RETURNING * INTO j;
   IF j.id IS NULL THEN RAISE EXCEPTION 'Job already claimed or canceled'; END IF;
   result=to_jsonb(j);
 WHEN 'heartbeat' THEN
   UPDATE olist_v21_sim.jobs SET lease_until=now()+interval '5 minutes' WHERE id=(p_body->>'id')::uuid AND status='running' AND worker_id=p_body->>'worker_id' AND lease_until>now() RETURNING * INTO j;
   IF j.id IS NULL THEN RAISE EXCEPTION 'Lease lost'; END IF; result=to_jsonb(j);
 WHEN 'recover' THEN
   WITH recovered AS (UPDATE olist_v21_sim.jobs SET status='interrupted',completed_at=now(),error='{"stage":"worker","message":"lease expired; explicit retry required"}',revision=revision+1 WHERE status='running' AND lease_until<now() RETURNING *) SELECT coalesce(jsonb_agg(to_jsonb(recovered)),'[]') INTO result FROM recovered;
 WHEN 'cancel' THEN
   UPDATE olist_v21_sim.jobs SET status='canceled',completed_at=now(),revision=revision+1 WHERE id=(p_body->>'id')::uuid AND status IN ('queued','running','awaiting_confirmation') RETURNING * INTO j;
   IF j.id IS NULL THEN RAISE EXCEPTION 'Not cancelable'; END IF; result=to_jsonb(j);
 WHEN 'fail' THEN
   UPDATE olist_v21_sim.jobs SET status='failed',error=p_body->'error',completed_at=now(),revision=revision+1 WHERE id=(p_body->>'id')::uuid AND status='running' AND worker_id=p_body->>'worker_id' RETURNING * INTO j;
   IF j.id IS NULL THEN RAISE EXCEPTION 'Failure owner mismatch or canceled'; END IF; result=to_jsonb(j);
 WHEN 'log' THEN
   INSERT INTO olist_v21_sim.job_logs(job_id,stage,detail) VALUES((p_body->>'id')::uuid,p_body->>'stage',p_body->'detail'); result='{"saved":true}';
 WHEN 'stage' THEN
   SELECT * INTO j FROM olist_v21_sim.jobs WHERE id=(p_body->>'job_id')::uuid FOR UPDATE;
   IF j.status IS DISTINCT FROM 'running' OR j.worker_id IS DISTINCT FROM p_body->>'worker_id' OR j.lease_until<=now() THEN RAISE EXCEPTION 'Lease lost or job canceled'; END IF;
   rowdata=p_body->'version'; IF rowdata->'manifest'->>'scenario_id' IS DISTINCT FROM 'gmv-drop-lab-v1' OR p_body->'analysis'->'simulation'->>'is_synthetic' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Synthetic scenario boundary failed'; END IF;
   IF rowdata->>'source'<>j.source OR rowdata->'manifest'->>'is_synthetic' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Source/real-data gate failed'; END IF;
   IF rowdata->>'quality' NOT IN ('verified','limited') THEN RAISE EXCEPTION 'Quality gate failed'; END IF;
   IF j.source='olist' AND (rowdata->>'quality'<>'verified' OR p_body->'analysis'->'operations'->'verification'->>'passed' IS DISTINCT FROM 'true' OR p_body->'analysis'->'monitoring'->>'status' IS DISTINCT FROM 'verified') THEN RAISE EXCEPTION 'Olist evidence gate failed'; END IF;
   SELECT * INTO v FROM olist_v21_sim.versions WHERE id=rowdata->>'id';
   IF v.id IS NOT NULL THEN
     IF v.source<>j.source OR v.file_hashes<>rowdata->'file_hashes' OR v.manifest<>rowdata->'manifest' OR (SELECT result_sha256 FROM olist_v21_sim.metric_snapshots WHERE version_id=v.id) IS DISTINCT FROM p_body->>'result_sha256' THEN RAISE EXCEPTION 'Immutable version conflict'; END IF;
   ELSE
     INSERT INTO olist_v21_sim.versions(id,source,content,manifest,file_hashes,quality,revision_of) VALUES(rowdata->>'id',j.source,rowdata,rowdata->'manifest',rowdata->'file_hashes',rowdata->>'quality',rowdata->>'revision_of');
     INSERT INTO olist_v21_sim.metric_snapshots VALUES(rowdata->>'id',p_body->'analysis',p_body->>'result_sha256',p_body->>'calculation_version',now());
   END IF;
   UPDATE olist_v21_sim.jobs SET status='awaiting_confirmation',version_id=rowdata->>'id',completed_at=now(),revision=revision+1 WHERE id=j.id RETURNING * INTO j; result=to_jsonb(j);
 WHEN 'publish' THEN
   SELECT * INTO j FROM olist_v21_sim.jobs WHERE id=(p_body->>'id')::uuid FOR UPDATE;
   IF j.status IS DISTINCT FROM 'awaiting_confirmation' THEN RAISE EXCEPTION 'No validated candidate'; END IF;
   PERFORM pg_advisory_xact_lock(hashtext('olist_v21_sim.publish.'||j.source));
   SELECT * INTO c FROM olist_v21_sim.current_versions WHERE source=j.source FOR UPDATE;
   IF c.version_id IS DISTINCT FROM p_body->>'expected_current' THEN RAISE EXCEPTION 'Current version changed; refresh before publishing'; END IF;
   SELECT * INTO v FROM olist_v21_sim.versions WHERE id=j.version_id;
   IF v.id IS NULL OR v.source<>j.source OR v.quality NOT IN ('verified','limited') THEN RAISE EXCEPTION 'Invalid version'; END IF;
   IF j.source='olist' THEN
     FOR rowdata IN SELECT value FROM jsonb_array_elements((SELECT snap.result->'monitoring'->'events' FROM olist_v21_sim.metric_snapshots snap WHERE snap.version_id=v.id)) LOOP
       INSERT INTO olist_v21_sim.alerts(event_id,version_id,rule_version,event) VALUES(rowdata->>'event_id',v.id,(SELECT calculation_version FROM olist_v21_sim.metric_snapshots WHERE version_id=v.id),rowdata) ON CONFLICT DO NOTHING;
     END LOOP;
   END IF;
   INSERT INTO olist_v21_sim.current_versions(source,version_id,actor) VALUES(j.source,j.version_id,p_actor) ON CONFLICT(source) DO UPDATE SET version_id=EXCLUDED.version_id,actor=p_actor,revision=olist_v21_sim.current_versions.revision+1,changed_at=now();
   UPDATE olist_v21_sim.jobs SET status='succeeded',revision=revision+1 WHERE id=j.id RETURNING * INTO j; result=to_jsonb(j);
 WHEN 'restore' THEN
   IF length(trim(coalesce(p_body->>'reason','')))=0 THEN RAISE EXCEPTION 'Restore reason required'; END IF;
   SELECT * INTO v FROM olist_v21_sim.versions WHERE id=p_body->>'version_id';
   IF v.id IS NULL OR NOT EXISTS(SELECT 1 FROM olist_v21_sim.jobs WHERE version_id=v.id AND status='succeeded') THEN RAISE EXCEPTION 'Not previously published'; END IF;
   PERFORM pg_advisory_xact_lock(hashtext('olist_v21_sim.publish.'||v.source));
   SELECT * INTO c FROM olist_v21_sim.current_versions WHERE source=v.source FOR UPDATE;
   IF c.version_id IS DISTINCT FROM p_body->>'expected_current' THEN RAISE EXCEPTION 'Current version changed'; END IF;
   UPDATE olist_v21_sim.current_versions SET version_id=v.id,actor=p_actor,revision=revision+1,changed_at=now() WHERE source=v.source; result=jsonb_build_object('version_id',v.id);
 WHEN 'task' THEN
   rowdata=p_body->'task';
   PERFORM pg_advisory_xact_lock(hashtext('olist_v21_sim.task.'||(rowdata->>'id')));
   SELECT * INTO oldtask FROM olist_v21_sim.investigations WHERE id=(rowdata->>'id')::uuid FOR UPDATE;
   IF oldtask.id IS NULL THEN
     IF (rowdata->>'revision')::bigint<>0 OR NOT EXISTS(SELECT 1 FROM olist_v21_sim.jobs WHERE version_id=rowdata->>'version' AND status='succeeded') THEN RAISE EXCEPTION 'Invalid task version'; END IF;
     INSERT INTO olist_v21_sim.investigations VALUES((rowdata->>'id')::uuid,rowdata->>'version',0,rowdata,now());
   ELSE
     IF oldtask.revision<>(p_body->>'expected_revision')::bigint OR (rowdata->>'revision')::bigint<>oldtask.revision+1 OR oldtask.version_id<>rowdata->>'version' OR oldtask.value->>'evidence_hash'<>rowdata->>'evidence_hash' THEN RAISE EXCEPTION 'Task revision/evidence conflict'; END IF;
     UPDATE olist_v21_sim.investigations SET revision=revision+1,value=rowdata,updated_at=now() WHERE id=oldtask.id;
   END IF; result=rowdata;
 ELSE RAISE EXCEPTION 'Unknown command';
 END CASE;
 IF p_operation NOT IN ('heartbeat','log') THEN
   INSERT INTO olist_v21_sim.audit_logs(actor,action,target,detail) VALUES(p_actor,p_operation,coalesce(p_body->>'id',p_body->>'job_id',p_body->>'subject',p_body->>'key','workspace'),jsonb_build_object('result_status',result->>'status'));
 END IF;
 RETURN result;
END $$;



-- Additive cancellation marker: retain existing status constraint and active index.
CREATE FUNCTION olist_v21_sim.cancel_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.cancel_requested AND (NEW.status='awaiting_confirmation' OR NEW.lease_until>OLD.lease_until) THEN RAISE EXCEPTION 'Cancellation requested; candidate and heartbeat rejected'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER cancel_guard BEFORE UPDATE ON olist_v21_sim.jobs FOR EACH ROW EXECUTE FUNCTION olist_v21_sim.cancel_guard();
CREATE FUNCTION public.olist_v21_sim_cancel(p_id uuid,p_actor text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,olist_v21_sim AS $$
DECLARE j olist_v21_sim.jobs;
BEGIN
 UPDATE olist_v21_sim.jobs SET cancel_requested=true,status=CASE WHEN status='running' THEN 'running' ELSE 'canceled' END,revision=revision+1
 WHERE id=p_id AND status IN ('queued','running','awaiting_confirmation') AND NOT cancel_requested RETURNING * INTO j;
 IF j.id IS NULL THEN RAISE EXCEPTION 'Not cancelable'; END IF;
 INSERT INTO olist_v21_sim.audit_logs(actor,action,target,detail) VALUES(p_actor,'cancel_request',p_id::text,jsonb_build_object('status',j.status));
 RETURN to_jsonb(j);
END $$;
CREATE FUNCTION public.olist_v21_sim_ack_cancel(p_id uuid,p_worker text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,olist_v21_sim AS $$
DECLARE j olist_v21_sim.jobs;
BEGIN
 UPDATE olist_v21_sim.jobs SET status='canceled',completed_at=now(),revision=revision+1
 WHERE id=p_id AND cancel_requested AND status IN ('running','failed') AND worker_id=p_worker RETURNING * INTO j;
 RETURN to_jsonb(j);
END $$;
CREATE FUNCTION public.olist_v21_sim_recover_canceled() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,olist_v21_sim AS $$
DECLARE n integer;
BEGIN
 UPDATE olist_v21_sim.jobs SET status='canceled',completed_at=now(),error='{"stage":"cancellation_recovery","message":"worker lease expired"}',revision=revision+1 WHERE status='running' AND cancel_requested AND lease_until<now();
 GET DIAGNOSTICS n=ROW_COUNT; RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.olist_v21_sim_cancel(uuid,text),public.olist_v21_sim_ack_cancel(uuid,text),public.olist_v21_sim_recover_canceled() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.olist_v21_sim_cancel(uuid,text),public.olist_v21_sim_ack_cancel(uuid,text),public.olist_v21_sim_recover_canceled() TO service_role;
-- Private object namespace inside the existing environment; no public read policy.
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES('olist-v21-simulated','olist-v21-simulated',false,134217728,ARRAY['application/octet-stream','text/csv','application/json']);
CREATE FUNCTION public.olist_v21_sim_file(p_file jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,olist_v21_sim AS $$
DECLARE existing olist_v21_sim.files;
BEGIN
 INSERT INTO olist_v21_sim.files(id,object_key,byte_length,source,filename) VALUES(p_file->>'sha256',p_file->>'object_key',(p_file->>'size')::bigint,p_file->>'source',p_file->>'filename') ON CONFLICT(id) DO NOTHING;
 SELECT * INTO existing FROM olist_v21_sim.files WHERE id=p_file->>'sha256';
 IF existing.byte_length<>(p_file->>'size')::bigint OR existing.object_key<>p_file->>'object_key' THEN RAISE EXCEPTION 'Immutable file conflict'; END IF;
 RETURN to_jsonb(existing);
END $$;
REVOKE ALL ON FUNCTION public.olist_v21_sim_file(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.olist_v21_sim_file(jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.olist_v21_sim_read(text,text), public.olist_v21_sim_command(text,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.olist_v21_sim_read(text,text), public.olist_v21_sim_command(text,jsonb,text) TO service_role;
