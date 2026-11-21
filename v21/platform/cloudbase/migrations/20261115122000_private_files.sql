-- Private object namespace inside the existing environment; no public read policy.
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES('olist-v21-private','olist-v21-private',false,134217728,ARRAY['application/octet-stream','text/csv','application/json']);
CREATE FUNCTION public.olist_v21_file(p_file jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,olist_v21 AS $$
DECLARE existing olist_v21.files;
BEGIN
 INSERT INTO olist_v21.files(id,object_key,byte_length,source,filename) VALUES(p_file->>'sha256',p_file->>'object_key',(p_file->>'size')::bigint,p_file->>'source',p_file->>'filename') ON CONFLICT(id) DO NOTHING;
 SELECT * INTO existing FROM olist_v21.files WHERE id=p_file->>'sha256';
 IF existing.byte_length<>(p_file->>'size')::bigint OR existing.object_key<>p_file->>'object_key' THEN RAISE EXCEPTION 'Immutable file conflict'; END IF;
 RETURN to_jsonb(existing);
END $$;
REVOKE ALL ON FUNCTION public.olist_v21_file(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.olist_v21_file(jsonb) TO service_role;
