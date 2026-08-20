-- =====================================================
-- MIGRACIÓN: Sistema de Facturación Mensual por Tenant
-- Tabla tenant_payments para control de pagos mensuales
-- =====================================================

-- Tabla de pagos mensuales por tenant
CREATE TABLE IF NOT EXISTS tenant_payments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  is_paid BOOLEAN DEFAULT false,
  paid_at TIMESTAMPTZ,
  paid_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, year, month)
);

-- Índices para consultas rápidas
CREATE INDEX IF NOT EXISTS idx_tenant_payments_tenant ON tenant_payments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_payments_year_month ON tenant_payments(year, month);

-- Habilitar Realtime para sincronización instantánea
ALTER PUBLICATION supabase_realtime ADD TABLE tenant_payments;

-- RLS (Row Level Security)
ALTER TABLE tenant_payments ENABLE ROW LEVEL SECURITY;

-- Super admin puede hacer todo
CREATE POLICY "Super admin full access tenant_payments" ON tenant_payments
  FOR ALL USING (true) WITH CHECK (true);
