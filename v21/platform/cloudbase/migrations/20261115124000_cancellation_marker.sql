-- Additive cancellation marker: retain existing status constraint and active index.
ALTER TABLE olist_v21.jobs ADD COLUMN cancel_requested boolean NOT NULL DEFAULT false;
CREATE FUNCTION olist_v21.cancel_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.cancel_requested AND (NEW.status='awaiting_confirmation' OR NEW.lease_until>OLD.lease_until) THEN RAISE EXCEPTION 'Cancellation requested; candidate and heartbeat rejected'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER cancel_guard BEFORE UPDATE ON olist_v21.jobs FOR EACH ROW EXECUTE FUNCTION olist_v21.cancel_guard();
CREATE FUNCTION public.olist_v21_cancel(p_id uuid,p_actor text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,olist_v21 AS $$
DECLARE j olist_v21.jobs;
BEGIN
 UPDATE olist_v21.jobs SET cancel_requested=true,status=CASE WHEN status='running' THEN 'running' ELSE 'canceled' END,revision=revision+1
 WHERE id=p_id AND status IN ('queued','running','awaiting_confirmation') AND NOT cancel_requested RETURNING * INTO j;
 IF j.id IS NULL THEN RAISE EXCEPTION 'Not cancelable'; END IF;
 INSERT INTO olist_v21.audit_logs(actor,action,target,detail) VALUES(p_actor,'cancel_request',p_id::text,jsonb_build_object('status',j.status));
 RETURN to_jsonb(j);
END $$;
CREATE FUNCTION public.olist_v21_ack_cancel(p_id uuid,p_worker text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,olist_v21 AS $$
DECLARE j olist_v21.jobs;
BEGIN
 UPDATE olist_v21.jobs SET status='canceled',completed_at=now(),revision=revision+1
 WHERE id=p_id AND cancel_requested AND status IN ('running','failed') AND worker_id=p_worker RETURNING * INTO j;
 RETURN to_jsonb(j);
END $$;
CREATE FUNCTION public.olist_v21_recover_canceled() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,olist_v21 AS $$
DECLARE n integer;
BEGIN
 UPDATE olist_v21.jobs SET status='canceled',completed_at=now(),error='{"stage":"cancellation_recovery","message":"worker lease expired"}',revision=revision+1 WHERE status='running' AND cancel_requested AND lease_until<now();
 GET DIAGNOSTICS n=ROW_COUNT; RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.olist_v21_cancel(uuid,text),public.olist_v21_ack_cancel(uuid,text),public.olist_v21_recover_canceled() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.olist_v21_cancel(uuid,text),public.olist_v21_ack_cancel(uuid,text),public.olist_v21_recover_canceled() TO service_role;
