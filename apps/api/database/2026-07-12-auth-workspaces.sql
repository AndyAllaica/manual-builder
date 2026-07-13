BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(80) NOT NULL,
    display_name VARCHAR(120) NOT NULL,
    email VARCHAR(160),
    password_hash TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT uq_users_username UNIQUE (username),
    CONSTRAINT chk_users_status CHECK (status IN ('active', 'disabled'))
);

CREATE TABLE IF NOT EXISTS public.workspace_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    user_id UUID NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'editor',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_workspace_members_workspace
        FOREIGN KEY (workspace_id)
        REFERENCES public.workspaces(id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,

    CONSTRAINT fk_workspace_members_user
        FOREIGN KEY (user_id)
        REFERENCES public.users(id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,

    CONSTRAINT uq_workspace_members_workspace_user UNIQUE (workspace_id, user_id),
    CONSTRAINT chk_workspace_members_role CHECK (role IN ('owner', 'admin', 'editor', 'viewer'))
);

CREATE INDEX IF NOT EXISTS idx_workspace_members_workspace_id
    ON public.workspace_members(workspace_id);

CREATE INDEX IF NOT EXISTS idx_workspace_members_user_id
    ON public.workspace_members(user_id);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_trigger
        WHERE tgname = 'trg_users_set_updated_at'
    ) THEN
        CREATE TRIGGER trg_users_set_updated_at
        BEFORE UPDATE ON public.users
        FOR EACH ROW
        EXECUTE FUNCTION public.set_updated_at();
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_trigger
        WHERE tgname = 'trg_workspace_members_set_updated_at'
    ) THEN
        CREATE TRIGGER trg_workspace_members_set_updated_at
        BEFORE UPDATE ON public.workspace_members
        FOR EACH ROW
        EXECUTE FUNCTION public.set_updated_at();
    END IF;
END;
$$;

-- Si ya tenias datos y quieres asignar todos los workspaces existentes
-- a un usuario registrado, cambia 'anderson' por el username real y ejecuta:
--
-- INSERT INTO public.workspace_members (workspace_id, user_id, role)
-- SELECT w.id, u.id, 'owner'
-- FROM public.workspaces w
-- CROSS JOIN public.users u
-- WHERE u.username = 'anderson'
-- ON CONFLICT (workspace_id, user_id) DO NOTHING;

COMMIT;
