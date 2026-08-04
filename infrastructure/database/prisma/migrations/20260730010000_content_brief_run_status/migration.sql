-- Los valores nuevos van en su propia migración: PostgreSQL no permite usar un
-- valor de enum en la misma transacción que lo agrega, y la migración siguiente
-- los necesita dentro de una restricción.
ALTER TYPE "content_brief_run_status" ADD VALUE IF NOT EXISTS 'pending' BEFORE 'generated';
ALTER TYPE "content_brief_run_status" ADD VALUE IF NOT EXISTS 'cancelled';
