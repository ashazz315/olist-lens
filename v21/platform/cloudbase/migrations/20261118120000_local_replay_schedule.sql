-- Separate scheduling settings from the legacy disabled collection setting.
CREATE FUNCTION public.olist_v21_replay_schedule(p_value jsonb DEFAULT NULL,p_actor text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,olist_v21 AS $$
DECLARE result jsonb;
BEGIN
 IF p_value IS NOT NULL THEN
  IF NOT EXISTS(SELECT 1 FROM olist_v21.users WHERE subject=p_actor AND role='admin' AND enabled) THEN
   RAISE EXCEPTION 'Administrator permission required';
  END IF;
  INSERT INTO olist_v21.settings(key,value) VALUES('local_replay',p_value)
  ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=now();
 END IF;
 SELECT value INTO result FROM olist_v21.settings WHERE key='local_replay';
 RETURN coalesce(result,'{}'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.olist_v21_replay_schedule(jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.olist_v21_replay_schedule(jsonb,text) TO service_role;
