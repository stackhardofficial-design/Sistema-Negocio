-- Agregar columnas para los montos divididos en ventas con multipagos
ALTER TABLE sales ADD COLUMN cash_amount DECIMAL(10, 2) DEFAULT 0;
ALTER TABLE sales ADD COLUMN transfer_amount DECIMAL(10, 2) DEFAULT 0;
