CREATE OR REPLACE FUNCTION public.delete_tenant_cascade(p_tenant_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID;
BEGIN
    -- Eliminar usuarios de auth.users (la tabla interna de Supabase)
    FOR v_user_id IN SELECT id FROM public.users WHERE tenant_id = p_tenant_id LOOP
        DELETE FROM auth.users WHERE id = v_user_id;
    END LOOP;
    
    -- Eliminar registros en cascada explícitamente para evitar problemas si las foreign keys no tienen ON DELETE CASCADE
    DELETE FROM public.activity_log WHERE tenant_id = p_tenant_id;
    DELETE FROM public.debtor_payments WHERE debtor_id IN (SELECT id FROM public.debtors WHERE tenant_id = p_tenant_id);
    DELETE FROM public.debtor_charges WHERE debtor_id IN (SELECT id FROM public.debtors WHERE tenant_id = p_tenant_id);
    DELETE FROM public.debtors WHERE tenant_id = p_tenant_id;
    
    DELETE FROM public.sale_items WHERE sale_id IN (SELECT id FROM public.sales WHERE tenant_id = p_tenant_id);
    DELETE FROM public.sales WHERE tenant_id = p_tenant_id;
    
    DELETE FROM public.expenses WHERE tenant_id = p_tenant_id;
    DELETE FROM public.expense_categories WHERE tenant_id = p_tenant_id;
    
    DELETE FROM public.buffet_order_items WHERE order_id IN (SELECT id FROM public.buffet_orders WHERE tenant_id = p_tenant_id);
    DELETE FROM public.buffet_orders WHERE tenant_id = p_tenant_id;
    
    DELETE FROM public.buffet_ingredients WHERE buffet_product_id IN (SELECT id FROM public.buffet_products WHERE tenant_id = p_tenant_id);
    DELETE FROM public.buffet_products WHERE tenant_id = p_tenant_id;
    
    DELETE FROM public.products WHERE tenant_id = p_tenant_id;
    DELETE FROM public.categories WHERE tenant_id = p_tenant_id;
    
    DELETE FROM public.users WHERE tenant_id = p_tenant_id;
    
    -- Finalmente, borrar el tenant
    DELETE FROM public.tenants WHERE id = p_tenant_id;
END;
$$;
