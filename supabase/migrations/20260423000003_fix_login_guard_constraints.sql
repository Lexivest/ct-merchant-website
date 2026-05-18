-- Fix missing constraints for login_security_guards
-- This ensures that ON CONFLICT (email) works correctly in our security RPCs

DO $$
BEGIN
    -- 1. Add Primary Key if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.table_constraints 
        WHERE table_name = 'login_security_guards' 
          AND constraint_type = 'PRIMARY KEY'
    ) THEN
        ALTER TABLE public.login_security_guards ADD PRIMARY KEY (email);
    END IF;

    -- 2. Ensure updated_at trigger exists
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'tr_login_security_guards_updated_at'
    ) THEN
        CREATE TRIGGER tr_login_security_guards_updated_at
        BEFORE UPDATE ON public.login_security_guards
        FOR EACH ROW
        EXECUTE FUNCTION public.set_login_security_guards_updated_at();
    END IF;
END $$;
