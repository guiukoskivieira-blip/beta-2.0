-- 004_allow_free_usage_events.sql: Permite eventos de uso de análise para plano Free e Prexyon sem subscription_id física
-- Migração segura, idempotente e retrocompatível.

-- 1. Remove restrição NOT NULL de subscription_id para permitir bilhetagem de plano Free
ALTER TABLE public.analysis_usage_events 
  ALTER COLUMN subscription_id DROP NOT NULL;

-- 2. Índice otimizado para consulta de uso por ciclo de faturamento para qualquer usuário (Free ou Pago)
CREATE INDEX IF NOT EXISTS idx_usage_events_user_cycle 
  ON public.analysis_usage_events(user_id, counted_at) 
  WHERE status = 'counted';
