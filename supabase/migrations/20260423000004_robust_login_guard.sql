-- SECURITY REPAIR: Finalizing Login Guard Logic
-- This migration ensures the table structure is solid and the functions are robust.

DO $$
BEGIN
    -- 1. Ensure the table exists with all required columns
    IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'login_security_guards') THEN
        CREATE TABLE public.login_security_guards (
            email text PRIMARY KEY,
            user_id uuid,
            failed_attempts integer NOT NULL DEFAULT 0,
            suspended_at timestamp with time zone,
            suspension_reason text,
            last_failed_at timestamp with time zone,
            last_success_at timestamp with time zone,
            created_at timestamp with time zone NOT NULL DEFAULT now(),
            updated_at timestamp with time zone NOT NULL DEFAULT now()
        );
    ELSE
        -- Ensure Primary Key exists on email
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.table_constraints 
            WHERE table_name = 'login_security_guards' AND constraint_type = 'PRIMARY KEY'
        ) THEN
            ALTER TABLE public.login_security_guards ADD PRIMARY KEY (email);
        END IF;
    END IF;
END $$;

-- 2. Create a robust Registration function that won't 400
CREATE OR REPLACE FUNCTION public.ctm_register_wrong_password_attempt(p_email text)
RETURNS TABLE(
    email text, 
    user_id uuid, 
    failed_attempts integer, 
    attempts_remaining integer, 
    is_suspended boolean, 
    suspended_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $$
DECLARE
    v_normalized_email text := lower(trim(coalesce(p_email, '')));
    v_matched_user_id uuid;
    v_failed_count integer;
    v_suspended_at timestamp with time zone;
BEGIN
    -- Search for the user in auth.users
    SELECT id INTO v_matched_user_id
    FROM auth.users
    WHERE lower(auth.users.email) = v_normalized_email
    LIMIT 1;

    -- If user doesn't exist, return a fake safe status
    IF v_matched_user_id IS NULL THEN
        RETURN QUERY SELECT v_normalized_email, NULL::uuid, 0, 3, false, NULL::timestamp with time zone;
        RETURN;
    END IF;

    -- Update or Insert the security record
    INSERT INTO public.login_security_guards (
        email, user_id, failed_attempts, last_failed_at, updated_at
    )
    VALUES (
        v_normalized_email, v_matched_user_id, 1, now(), now()
    )
    ON CONFLICT (email) DO UPDATE
    SET
        failed_attempts = CASE
            WHEN login_security_guards.suspended_at IS NOT NULL THEN GREATEST(login_security_guards.failed_attempts, 3)
            ELSE LEAST(login_security_guards.failed_attempts + 1, 3)
        END,
        last_failed_at = now(),
        updated_at = now(),
        suspended_at = CASE
            WHEN login_security_guards.suspended_at IS NOT NULL THEN login_security_guards.suspended_at
            WHEN login_security_guards.failed_attempts + 1 >= 3 THEN now()
            ELSE NULL
        END,
        suspension_reason = CASE
            WHEN login_security_guards.suspended_at IS NOT NULL THEN COALESCE(login_security_guards.suspension_reason, 'too_many_wrong_password_attempts')
            WHEN login_security_guards.failed_attempts + 1 >= 3 THEN 'too_many_wrong_password_attempts'
            ELSE NULL
        END
    RETURNING login_security_guards.failed_attempts, login_security_guards.suspended_at INTO v_failed_count, v_suspended_at;

    RETURN QUERY
    SELECT
        v_normalized_email,
        v_matched_user_id,
        v_failed_count,
        GREATEST(0, 3 - v_failed_count),
        v_suspended_at IS NOT NULL,
        v_suspended_at;
END;
$$;

-- 3. Update the Status check function to be equally robust
CREATE OR REPLACE FUNCTION public.ctm_get_login_guard_status(p_email text)
RETURNS TABLE(
    email text, 
    user_id uuid, 
    failed_attempts integer, 
    attempts_remaining integer, 
    is_suspended boolean, 
    suspended_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $$
DECLARE
    v_normalized_email text := lower(trim(coalesce(p_email, '')));
BEGIN
    RETURN QUERY
    SELECT
        v_normalized_email,
        lsg.user_id,
        COALESCE(lsg.failed_attempts, 0),
        GREATEST(0, 3 - COALESCE(lsg.failed_attempts, 0)),
        COALESCE(lsg.suspended_at IS NOT NULL, false),
        lsg.suspended_at
    FROM (SELECT 1) AS dummy -- ensure at least one row if joined fails
    LEFT JOIN public.login_security_guards lsg ON lsg.email = v_normalized_email;
    
    -- If no row was found by the join, return the safe default
    IF NOT FOUND THEN
        RETURN QUERY SELECT v_normalized_email, NULL::uuid, 0, 3, false, NULL::timestamp with time zone;
    END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ctm_register_wrong_password_attempt(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ctm_get_login_guard_status(text) TO anon, authenticated;
