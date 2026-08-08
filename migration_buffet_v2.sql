-- Modificar tabla buffet_products
ALTER TABLE buffet_products
ADD COLUMN barcode varchar(255),
ADD COLUMN stock integer,
ADD COLUMN min_stock integer,
ADD COLUMN is_composite boolean DEFAULT false;

-- Crear tabla buffet_product_components
CREATE TABLE IF NOT EXISTS buffet_product_components (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    composite_buffet_product_id uuid NOT NULL REFERENCES buffet_products(id) ON DELETE CASCADE,
    component_buffet_product_id uuid REFERENCES buffet_products(id) ON DELETE SET NULL,
    component_product_id uuid REFERENCES products(id) ON DELETE SET NULL,
    quantity numeric NOT NULL CHECK (quantity > 0),
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT check_component_type CHECK (
        (component_buffet_product_id IS NOT NULL AND component_product_id IS NULL) OR
        (component_buffet_product_id IS NULL AND component_product_id IS NOT NULL)
    )
);

-- Políticas RLS para buffet_product_components
ALTER TABLE buffet_product_components ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view components of their tenant"
    ON buffet_product_components FOR SELECT
    USING (tenant_id IN (
        SELECT tenant_id FROM users WHERE id = auth.uid()
    ));

CREATE POLICY "Admins can insert components"
    ON buffet_product_components FOR INSERT
    WITH CHECK (
        tenant_id IN (
            SELECT tenant_id FROM users WHERE id = auth.uid() AND role = 'admin'
        )
    );

CREATE POLICY "Admins can update components"
    ON buffet_product_components FOR UPDATE
    USING (
        tenant_id IN (
            SELECT tenant_id FROM users WHERE id = auth.uid() AND role = 'admin'
        )
    );

CREATE POLICY "Admins can delete components"
    ON buffet_product_components FOR DELETE
    USING (
        tenant_id IN (
            SELECT tenant_id FROM users WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- Habilitar replicación realtime para la nueva tabla
ALTER PUBLICATION supabase_realtime ADD TABLE buffet_product_components;
