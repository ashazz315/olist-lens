-- Additive M1 migration. No changes to existing projects, auth tables or metrics.
CREATE SCHEMA olist_v21;
REVOKE ALL ON SCHEMA olist_v21 FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA olist_v21 TO service_role;

CREATE TABLE olist_v21.users (
  subject text PRIMARY KEY, role text NOT NULL CHECK(role IN ('admin','analyst')),
  enabled boolean NOT NULL DEFAULT true, display_name text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE olist_v21.sources (
  id text PRIMARY KEY CHECK(id IN ('olist','inventory','advertising','ga4')),
  config jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO olist_v21.sources VALUES
 ('olist','{"mode":"historical_replay","update":"manual_upload","currency":"BRL"}',now()),
 ('inventory','{"mode":"independent_retail","join_olist":false,"cost_verified":false}',now()),
 ('advertising','{"mode":"independent_advertising","join_olist":false,"impressions":null,"clicks":null,"revenue":null}',now()),
 ('ga4','{"status":"authorization_required","connected":false,"join_olist":false}',now());
CREATE TABLE olist_v21.files (
  id text PRIMARY KEY CHECK(id ~ '^[a-f0-9]{64}$'), object_key text NOT NULL UNIQUE,
  byte_length bigint NOT NULL CHECK(byte_length>=0), source text NOT NULL REFERENCES olist_v21.sources,
  filename text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE olist_v21.jobs (
  id uuid PRIMARY KEY, source text NOT NULL REFERENCES olist_v21.sources,
  status text NOT NULL CHECK(status IN ('queued','running','awaiting_confirmation','succeeded','failed','canceled','interrupted')),
  request jsonb NOT NULL, retry_of uuid REFERENCES olist_v21.jobs,
  version_id text, actor text NOT NULL, worker_id text, lease_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), started_at timestamptz, completed_at timestamptz,
  error jsonb, revision bigint NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX one_active_dataset ON olist_v21.jobs(source) WHERE status IN ('queued','running','awaiting_confirmation');
CREATE TABLE olist_v21.job_logs (
  seq bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, job_id uuid NOT NULL REFERENCES olist_v21.jobs,
  at timestamptz NOT NULL DEFAULT now(), stage text NOT NULL, detail jsonb NOT NULL
);
CREATE TABLE olist_v21.versions (
  id text PRIMARY KEY CHECK(id ~ '^[a-f0-9]{64}$'), source text NOT NULL REFERENCES olist_v21.sources,
  content jsonb NOT NULL, manifest jsonb NOT NULL, file_hashes jsonb NOT NULL,
  quality text NOT NULL CHECK(quality IN ('verified','limited')),
  revision_of text REFERENCES olist_v21.versions, created_at timestamptz NOT NULL DEFAULT now(),
  CHECK(manifest->>'is_synthetic'='false')
);
CREATE TABLE olist_v21.metric_snapshots (
  version_id text PRIMARY KEY REFERENCES olist_v21.versions,
  result jsonb NOT NULL, result_sha256 text NOT NULL CHECK(result_sha256 ~ '^[a-f0-9]{64}$'),
  calculation_version text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE olist_v21.current_versions (
  source text PRIMARY KEY REFERENCES olist_v21.sources, version_id text NOT NULL REFERENCES olist_v21.versions,
  revision bigint NOT NULL DEFAULT 0, actor text NOT NULL, changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE olist_v21.alerts (
  event_id text NOT NULL, version_id text NOT NULL REFERENCES olist_v21.versions,
  rule_version text NOT NULL, event jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','investigating','closed')),
  history jsonb NOT NULL DEFAULT '[]', PRIMARY KEY(version_id,rule_version,event_id)
);
CREATE TABLE olist_v21.investigations (
  id uuid PRIMARY KEY, version_id text NOT NULL REFERENCES olist_v21.versions,
  revision bigint NOT NULL, value jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE olist_v21.settings (
  key text PRIMARY KEY, value jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE olist_v21.reports (
  id uuid PRIMARY KEY, version_id text NOT NULL REFERENCES olist_v21.versions,
  actor text NOT NULL, format text NOT NULL, evidence jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE olist_v21.audit_logs (
  seq bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, actor text NOT NULL,
  action text NOT NULL, target text NOT NULL, detail jsonb NOT NULL, at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO olist_v21.settings VALUES
 ('schedule','{"enabled":false,"timezone":"Asia/Shanghai","time":"02:00","collection_connected":false}',now()),
 ('engine_acceptance','{"order_validation":"pending_three_serial_runs","full_calculation_stability":"pending","blocks_platform_development":false}',now());

CREATE FUNCTION olist_v21.immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'immutable record'; END $$;
CREATE TRIGGER files_immutable BEFORE UPDATE OR DELETE ON olist_v21.files FOR EACH ROW EXECUTE FUNCTION olist_v21.immutable();
CREATE TRIGGER versions_immutable BEFORE UPDATE OR DELETE ON olist_v21.versions FOR EACH ROW EXECUTE FUNCTION olist_v21.immutable();
CREATE TRIGGER snapshots_immutable BEFORE UPDATE OR DELETE ON olist_v21.metric_snapshots FOR EACH ROW EXECUTE FUNCTION olist_v21.immutable();
CREATE TRIGGER audit_immutable BEFORE UPDATE OR DELETE ON olist_v21.audit_logs FOR EACH ROW EXECUTE FUNCTION olist_v21.immutable();
CREATE TRIGGER logs_immutable BEFORE UPDATE OR DELETE ON olist_v21.job_logs FOR EACH ROW EXECUTE FUNCTION olist_v21.immutable();

-- Authenticated clients can only inspect their own membership. Mutations are
-- exclusively performed by the backend service role after API authorization.
CREATE FUNCTION public.olist_v21_me() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,olist_v21 AS $$
 SELECT jsonb_build_object('subject',subject,'role',role,'display_name',display_name)
 FROM olist_v21.users WHERE subject=auth.uid() AND enabled
$$;
REVOKE ALL ON FUNCTION public.olist_v21_me() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.olist_v21_me() TO authenticated,service_role;

CREATE FUNCTION public.olist_v21_read(p_kind text,p_id text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,olist_v21 AS $$
DECLARE result jsonb;
BEGIN
 CASE p_kind
 WHEN 'users' THEN SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]') INTO result FROM olist_v21.users t;
 WHEN 'sources' THEN SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]') INTO result FROM olist_v21.sources t;
 WHEN 'jobs' THEN SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.created_at DESC),'[]') INTO result FROM olist_v21.jobs t WHERE p_id IS NULL OR t.id::text=p_id;
 WHEN 'logs' THEN SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY seq),'[]') INTO result FROM olist_v21.job_logs t WHERE job_id::text=p_id;
 WHEN 'versions' THEN SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY created_at DESC),'[]') INTO result FROM olist_v21.versions t WHERE p_id IS NULL OR id=p_id;
 WHEN 'current' THEN SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]') INTO result FROM olist_v21.current_versions t;
 WHEN 'snapshots' THEN SELECT to_jsonb(t) INTO result FROM olist_v21.metric_snapshots t WHERE version_id=p_id;
 WHEN 'alerts' THEN SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]') INTO result FROM olist_v21.alerts t WHERE p_id IS NULL OR version_id=p_id;
 WHEN 'tasks' THEN SELECT coalesce(jsonb_agg(value ORDER BY updated_at DESC),'[]') INTO result FROM olist_v21.investigations WHERE p_id IS NULL OR id::text=p_id;
 WHEN 'settings' THEN SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]') INTO result FROM olist_v21.settings t;
 WHEN 'audit' THEN SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]') INTO result FROM (SELECT * FROM olist_v21.audit_logs ORDER BY seq DESC LIMIT 200) t;
 ELSE RAISE EXCEPTION 'Unknown read kind';
 END CASE; RETURN result;
END $$;

CREATE FUNCTION public.olist_v21_command(p_operation text,p_body jsonb,p_actor text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,olist_v21 AS $$
DECLARE j olist_v21.jobs; v olist_v21.versions; c olist_v21.current_versions; oldtask olist_v21.investigations;
 result jsonb; rowdata jsonb; new_id uuid; oldrole text;
BEGIN
 IF p_actor IS NULL OR length(trim(p_actor))=0 THEN RAISE EXCEPTION 'Actor required'; END IF;
 CASE p_operation
 WHEN 'submit' THEN
   new_id=(p_body->>'id')::uuid;
   IF p_body->>'source'='ga4' THEN RAISE EXCEPTION 'GA4 authorization required'; END IF;
   IF p_body->>'retry_of' IS NOT NULL THEN
     SELECT * INTO j FROM olist_v21.jobs WHERE id=(p_body->>'retry_of')::uuid FOR UPDATE;
     IF j.id IS NULL OR j.source<>p_body->>'source' OR j.status NOT IN ('failed','interrupted','canceled') OR j.request<>p_body->'request' THEN RAISE EXCEPTION 'Invalid retry'; END IF;
   END IF;
   INSERT INTO olist_v21.jobs(id,source,status,request,retry_of,actor) VALUES(new_id,p_body->>'source','queued',p_body->'request',(p_body->>'retry_of')::uuid,p_actor) RETURNING * INTO j;
   result=to_jsonb(j);
 WHEN 'claim' THEN
   UPDATE olist_v21.jobs SET status='running',worker_id=p_body->>'worker_id',lease_until=now()+interval '5 minutes',started_at=now(),revision=revision+1
   WHERE id=(p_body->>'id')::uuid AND status='queued' RETURNING * INTO j;
   IF j.id IS NULL THEN RAISE EXCEPTION 'Job already claimed or canceled'; END IF;
   result=to_jsonb(j);
 WHEN 'heartbeat' THEN
   UPDATE olist_v21.jobs SET lease_until=now()+interval '5 minutes' WHERE id=(p_body->>'id')::uuid AND status='running' AND worker_id=p_body->>'worker_id' AND lease_until>now() RETURNING * INTO j;
   IF j.id IS NULL THEN RAISE EXCEPTION 'Lease lost'; END IF; result=to_jsonb(j);
 WHEN 'recover' THEN
   WITH recovered AS (UPDATE olist_v21.jobs SET status='interrupted',completed_at=now(),error='{"stage":"worker","message":"lease expired; explicit retry required"}',revision=revision+1 WHERE status='running' AND lease_until<now() RETURNING *) SELECT coalesce(jsonb_agg(to_jsonb(recovered)),'[]') INTO result FROM recovered;
 WHEN 'cancel' THEN
   UPDATE olist_v21.jobs SET status='canceled',completed_at=now(),revision=revision+1 WHERE id=(p_body->>'id')::uuid AND status IN ('queued','running','awaiting_confirmation') RETURNING * INTO j;
   IF j.id IS NULL THEN RAISE EXCEPTION 'Not cancelable'; END IF; result=to_jsonb(j);
 WHEN 'fail' THEN
   UPDATE olist_v21.jobs SET status='failed',error=p_body->'error',completed_at=now(),revision=revision+1 WHERE id=(p_body->>'id')::uuid AND status='running' AND worker_id=p_body->>'worker_id' RETURNING * INTO j;
   IF j.id IS NULL THEN RAISE EXCEPTION 'Failure owner mismatch or canceled'; END IF; result=to_jsonb(j);
 WHEN 'log' THEN
   INSERT INTO olist_v21.job_logs(job_id,stage,detail) VALUES((p_body->>'id')::uuid,p_body->>'stage',p_body->'detail'); result='{"saved":true}';
 WHEN 'stage' THEN
   SELECT * INTO j FROM olist_v21.jobs WHERE id=(p_body->>'job_id')::uuid FOR UPDATE;
   IF j.status IS DISTINCT FROM 'running' OR j.worker_id IS DISTINCT FROM p_body->>'worker_id' OR j.lease_until<=now() THEN RAISE EXCEPTION 'Lease lost or job canceled'; END IF;
   rowdata=p_body->'version';
   IF rowdata->>'source'<>j.source OR rowdata->'manifest'->>'is_synthetic' IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'Source/real-data gate failed'; END IF;
   IF rowdata->>'quality' NOT IN ('verified','limited') THEN RAISE EXCEPTION 'Quality gate failed'; END IF;
   IF j.source='olist' AND (rowdata->>'quality'<>'verified' OR p_body->'analysis'->'operations'->'verification'->>'passed' IS DISTINCT FROM 'true' OR p_body->'analysis'->'monitoring'->>'status' IS DISTINCT FROM 'verified') THEN RAISE EXCEPTION 'Olist evidence gate failed'; END IF;
   SELECT * INTO v FROM olist_v21.versions WHERE id=rowdata->>'id';
   IF v.id IS NOT NULL THEN
     IF v.source<>j.source OR v.file_hashes<>rowdata->'file_hashes' OR v.manifest<>rowdata->'manifest' OR (SELECT result_sha256 FROM olist_v21.metric_snapshots WHERE version_id=v.id) IS DISTINCT FROM p_body->>'result_sha256' THEN RAISE EXCEPTION 'Immutable version conflict'; END IF;
   ELSE
     INSERT INTO olist_v21.versions(id,source,content,manifest,file_hashes,quality,revision_of) VALUES(rowdata->>'id',j.source,rowdata,rowdata->'manifest',rowdata->'file_hashes',rowdata->>'quality',rowdata->>'revision_of');
     INSERT INTO olist_v21.metric_snapshots VALUES(rowdata->>'id',p_body->'analysis',p_body->>'result_sha256',p_body->>'calculation_version',now());
   END IF;
   UPDATE olist_v21.jobs SET status='awaiting_confirmation',version_id=rowdata->>'id',completed_at=now(),revision=revision+1 WHERE id=j.id RETURNING * INTO j; result=to_jsonb(j);
 WHEN 'publish' THEN
   SELECT * INTO j FROM olist_v21.jobs WHERE id=(p_body->>'id')::uuid FOR UPDATE;
   IF j.status IS DISTINCT FROM 'awaiting_confirmation' THEN RAISE EXCEPTION 'No validated candidate'; END IF;
   PERFORM pg_advisory_xact_lock(hashtext('olist_v21.publish.'||j.source));
   SELECT * INTO c FROM olist_v21.current_versions WHERE source=j.source FOR UPDATE;
   IF c.version_id IS DISTINCT FROM p_body->>'expected_current' THEN RAISE EXCEPTION 'Current version changed; refresh before publishing'; END IF;
   SELECT * INTO v FROM olist_v21.versions WHERE id=j.version_id;
   IF v.id IS NULL OR v.source<>j.source OR v.quality NOT IN ('verified','limited') THEN RAISE EXCEPTION 'Invalid version'; END IF;
   IF j.source='olist' THEN
     FOR rowdata IN SELECT value FROM jsonb_array_elements((SELECT result->'monitoring'->'events' FROM olist_v21.metric_snapshots WHERE version_id=v.id)) LOOP
       INSERT INTO olist_v21.alerts(event_id,version_id,rule_version,event) VALUES(rowdata->>'event_id',v.id,(SELECT calculation_version FROM olist_v21.metric_snapshots WHERE version_id=v.id),rowdata) ON CONFLICT DO NOTHING;
     END LOOP;
   END IF;
   INSERT INTO olist_v21.current_versions(source,version_id,actor) VALUES(j.source,j.version_id,p_actor) ON CONFLICT(source) DO UPDATE SET version_id=EXCLUDED.version_id,actor=p_actor,revision=olist_v21.current_versions.revision+1,changed_at=now();
   UPDATE olist_v21.jobs SET status='succeeded',revision=revision+1 WHERE id=j.id RETURNING * INTO j; result=to_jsonb(j);
 WHEN 'restore' THEN
   IF length(trim(coalesce(p_body->>'reason','')))=0 THEN RAISE EXCEPTION 'Restore reason required'; END IF;
   SELECT * INTO v FROM olist_v21.versions WHERE id=p_body->>'version_id';
   IF v.id IS NULL OR NOT EXISTS(SELECT 1 FROM olist_v21.jobs WHERE version_id=v.id AND status='succeeded') THEN RAISE EXCEPTION 'Not previously published'; END IF;
   PERFORM pg_advisory_xact_lock(hashtext('olist_v21.publish.'||v.source));
   SELECT * INTO c FROM olist_v21.current_versions WHERE source=v.source FOR UPDATE;
   IF c.version_id IS DISTINCT FROM p_body->>'expected_current' THEN RAISE EXCEPTION 'Current version changed'; END IF;
   UPDATE olist_v21.current_versions SET version_id=v.id,actor=p_actor,revision=revision+1,changed_at=now() WHERE source=v.source; result=jsonb_build_object('version_id',v.id);
 WHEN 'task' THEN
   rowdata=p_body->'task';
   PERFORM pg_advisory_xact_lock(hashtext('olist_v21.task.'||(rowdata->>'id')));
   SELECT * INTO oldtask FROM olist_v21.investigations WHERE id=(rowdata->>'id')::uuid FOR UPDATE;
   IF oldtask.id IS NULL THEN
     IF (rowdata->>'revision')::bigint<>0 OR NOT EXISTS(SELECT 1 FROM olist_v21.jobs WHERE version_id=rowdata->>'version' AND status='succeeded') THEN RAISE EXCEPTION 'Invalid task version'; END IF;
     INSERT INTO olist_v21.investigations VALUES((rowdata->>'id')::uuid,rowdata->>'version',0,rowdata,now());
   ELSE
     IF oldtask.revision<>(p_body->>'expected_revision')::bigint OR (rowdata->>'revision')::bigint<>oldtask.revision+1 OR oldtask.version_id<>rowdata->>'version' OR oldtask.value->>'evidence_hash'<>rowdata->>'evidence_hash' THEN RAISE EXCEPTION 'Task revision/evidence conflict'; END IF;
     UPDATE olist_v21.investigations SET revision=revision+1,value=rowdata,updated_at=now() WHERE id=oldtask.id;
   END IF; result=rowdata;
 WHEN 'user' THEN
   PERFORM pg_advisory_xact_lock(hashtext('olist_v21.users'));
   SELECT role INTO oldrole FROM olist_v21.users WHERE subject=p_body->>'subject' AND enabled;
   IF oldrole='admin' AND (p_body->>'role'<>'admin' OR p_body->>'enabled'='false') AND (SELECT count(*) FROM olist_v21.users WHERE role='admin' AND enabled)<=1 THEN RAISE EXCEPTION 'Cannot remove last admin'; END IF;
   INSERT INTO olist_v21.users(subject,role,enabled,display_name) VALUES(p_body->>'subject',p_body->>'role',(p_body->>'enabled')::boolean,p_body->>'display_name') ON CONFLICT(subject) DO UPDATE SET role=EXCLUDED.role,enabled=EXCLUDED.enabled,display_name=EXCLUDED.display_name,updated_at=now(); result='{"saved":true}';
 WHEN 'setting' THEN
   IF p_body->>'key' NOT IN ('model','schedule','engine_acceptance') THEN RAISE EXCEPTION 'Unknown setting'; END IF;
   IF p_body->>'key'='schedule' AND p_body->'value'->>'enabled'='true' THEN RAISE EXCEPTION 'Scheduler not deployed'; END IF;
   INSERT INTO olist_v21.settings VALUES(p_body->>'key',p_body->'value',now()) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=now(); result='{"saved":true}';
 ELSE RAISE EXCEPTION 'Unknown command';
 END CASE;
 IF p_operation NOT IN ('heartbeat','log') THEN
   INSERT INTO olist_v21.audit_logs(actor,action,target,detail) VALUES(p_actor,p_operation,coalesce(p_body->>'id',p_body->>'job_id',p_body->>'subject',p_body->>'key','workspace'),jsonb_build_object('result_status',result->>'status'));
 END IF;
 RETURN result;
END $$;

REVOKE ALL ON FUNCTION public.olist_v21_read(text,text),public.olist_v21_command(text,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.olist_v21_read(text,text),public.olist_v21_command(text,jsonb,text) TO service_role;
REVOKE ALL ON ALL TABLES IN SCHEMA olist_v21 FROM PUBLIC,anon,authenticated;
DO $$ DECLARE t record; BEGIN FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='olist_v21' LOOP EXECUTE format('ALTER TABLE olist_v21.%I ENABLE ROW LEVEL SECURITY',t.tablename); END LOOP; END $$;
-- No business CSVs, credentials, user accounts or synthetic records are seeded.
