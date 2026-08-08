-- Habilitar la inserción de productos de buffet en las ventas
ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS buffet_product_id UUID REFERENCES buffet_products(id) ON DELETE SET NULL;
