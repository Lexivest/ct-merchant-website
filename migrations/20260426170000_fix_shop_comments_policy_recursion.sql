CREATE OR REPLACE FUNCTION public.ctm_shop_comment_parent_is_valid(
  p_parent_id uuid,
  p_shop_id bigint
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.shop_comments parent
    WHERE parent.id = p_parent_id
      AND parent.shop_id = p_shop_id
  );
$$;

REVOKE ALL ON FUNCTION public.ctm_shop_comment_parent_is_valid(uuid, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ctm_shop_comment_parent_is_valid(uuid, bigint) TO authenticated, service_role;

DROP POLICY IF EXISTS "CTM shop comments insert" ON public.shop_comments;

CREATE POLICY "CTM shop comments insert"
ON public.shop_comments
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = (SELECT auth.uid())
  AND status = 'pending'
  AND EXISTS (
    SELECT 1
    FROM public.shops s
    WHERE s.id = shop_comments.shop_id
  )
  AND (
    product_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.products p
      WHERE p.id = shop_comments.product_id
        AND p.shop_id = shop_comments.shop_id
    )
  )
  AND (
    parent_id IS NULL
    OR (SELECT public.ctm_shop_comment_parent_is_valid(parent_id, shop_id))
  )
);
