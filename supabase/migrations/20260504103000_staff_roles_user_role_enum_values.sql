-- Postgres 55P04: new enum values are not usable until committed. This migration runs alone
-- so the ALTER TYPE commits before helpers/INSERT in 20260504103500_staff_roles_enum_helpers.sql.

ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'DIRECTOR';
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'SECRETARY';
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'TREASURER';
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'LIBRARIAN';
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'STOCK_MANAGER';
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'RECEPTIONIST';
