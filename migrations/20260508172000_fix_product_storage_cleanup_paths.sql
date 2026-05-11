-- Product image URLs are stored as public URLs, while storage.objects.name stores
-- only the object path. Parse product URLs before deleting bucket objects.

CREATE OR REPLACE FUNCTION public.cleanup_orphaned_product_images()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_paths text[];
BEGIN
  PERFORM set_config('storage.allow_delete_query', 'true', true);

  IF TG_OP = 'DELETE' THEN
    v_paths := ARRAY[
      public.ctm_storage_path_from_url(OLD.image_url, 'products'),
      public.ctm_storage_path_from_url(OLD.image_url_2, 'products'),
      public.ctm_storage_path_from_url(OLD.image_url_3, 'products')
    ];

    DELETE FROM storage.objects
    WHERE bucket_id = 'products'
      AND name IN (
        SELECT object_path
        FROM unnest(v_paths) AS deleted_path(object_path)
        WHERE object_path IS NOT NULL AND object_path <> ''
      );

    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    v_paths := ARRAY[
      CASE
        WHEN OLD.image_url IS DISTINCT FROM NEW.image_url
          AND public.ctm_storage_path_from_url(OLD.image_url, 'products') NOT IN (
            coalesce(public.ctm_storage_path_from_url(NEW.image_url, 'products'), ''),
            coalesce(public.ctm_storage_path_from_url(NEW.image_url_2, 'products'), ''),
            coalesce(public.ctm_storage_path_from_url(NEW.image_url_3, 'products'), '')
          )
        THEN public.ctm_storage_path_from_url(OLD.image_url, 'products')
        ELSE NULL
      END,
      CASE
        WHEN OLD.image_url_2 IS DISTINCT FROM NEW.image_url_2
          AND public.ctm_storage_path_from_url(OLD.image_url_2, 'products') NOT IN (
            coalesce(public.ctm_storage_path_from_url(NEW.image_url, 'products'), ''),
            coalesce(public.ctm_storage_path_from_url(NEW.image_url_2, 'products'), ''),
            coalesce(public.ctm_storage_path_from_url(NEW.image_url_3, 'products'), '')
          )
        THEN public.ctm_storage_path_from_url(OLD.image_url_2, 'products')
        ELSE NULL
      END,
      CASE
        WHEN OLD.image_url_3 IS DISTINCT FROM NEW.image_url_3
          AND public.ctm_storage_path_from_url(OLD.image_url_3, 'products') NOT IN (
            coalesce(public.ctm_storage_path_from_url(NEW.image_url, 'products'), ''),
            coalesce(public.ctm_storage_path_from_url(NEW.image_url_2, 'products'), ''),
            coalesce(public.ctm_storage_path_from_url(NEW.image_url_3, 'products'), '')
          )
        THEN public.ctm_storage_path_from_url(OLD.image_url_3, 'products')
        ELSE NULL
      END
    ];

    DELETE FROM storage.objects
    WHERE bucket_id = 'products'
      AND name IN (
        SELECT object_path
        FROM unnest(v_paths) AS deleted_path(object_path)
        WHERE object_path IS NOT NULL AND object_path <> ''
      );

    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_orphaned_product_images() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_orphaned_product_images() TO authenticated, service_role;
