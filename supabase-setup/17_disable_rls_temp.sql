-- =====================================================
-- RLS 임시 비활성화 (테스트용)
-- =====================================================

-- ⚠️ 주의: 이것은 테스트 목적으로만 사용하세요!
-- 프로덕션 환경에서는 적절한 RLS 정책을 설정해야 합니다.

-- =====================================================
-- 1. 모든 테이블의 RLS 비활성화
-- =====================================================

ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE categories DISABLE ROW LEVEL SECURITY;
ALTER TABLE products DISABLE ROW LEVEL SECURITY;
ALTER TABLE stores DISABLE ROW LEVEL SECURITY;
ALTER TABLE store_products DISABLE ROW LEVEL SECURITY;
ALTER TABLE orders DISABLE ROW LEVEL SECURITY;
ALTER TABLE order_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE daily_sales_summary DISABLE ROW LEVEL SECURITY;
ALTER TABLE product_sales_summary DISABLE ROW LEVEL SECURITY;
ALTER TABLE order_status_history DISABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_transactions DISABLE ROW LEVEL SECURITY;
ALTER TABLE supply_requests DISABLE ROW LEVEL SECURITY;
ALTER TABLE supply_request_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE shipments DISABLE ROW LEVEL SECURITY;
ALTER TABLE notifications DISABLE ROW LEVEL SECURITY;
ALTER TABLE system_settings DISABLE ROW LEVEL SECURITY;

-- 추가 테이블들
ALTER TABLE wishlists DISABLE ROW LEVEL SECURITY;
ALTER TABLE user_addresses DISABLE ROW LEVEL SECURITY;
ALTER TABLE coupons DISABLE ROW LEVEL SECURITY;
ALTER TABLE user_coupons DISABLE ROW LEVEL SECURITY;
ALTER TABLE payment_methods DISABLE ROW LEVEL SECURITY;

-- refunds 테이블이 있다면
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'refunds') THEN
        ALTER TABLE refunds DISABLE ROW LEVEL SECURITY;
    END IF;
END $$;

-- refund_items 테이블이 있다면
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'refund_items') THEN
        ALTER TABLE refund_items DISABLE ROW LEVEL SECURITY;
    END IF;
END $$;

-- promotions 테이블이 있다면
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'promotions') THEN
        ALTER TABLE promotions DISABLE ROW LEVEL SECURITY;
    END IF;
END $$;

-- promotion_products 테이블이 있다면
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'promotion_products') THEN
        ALTER TABLE promotion_products DISABLE ROW LEVEL SECURITY;
    END IF;
END $$;

-- =====================================================
-- 2. RLS 비활성화 확인
-- =====================================================

SELECT
    schemaname,
    tablename,
    rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
    AND tablename IN (
        'profiles', 'categories', 'products', 'stores', 'store_products',
        'orders', 'order_items', 'wishlists', 'user_addresses', 'coupons',
        'user_coupons', 'payment_methods', 'refunds', 'refund_items',
        'promotions', 'promotion_products'
    )
ORDER BY tablename;

-- =====================================================
-- 완료 메시지
-- =====================================================

DO $$
BEGIN
  RAISE NOTICE '✅ RLS가 임시로 비활성화되었습니다!';
  RAISE NOTICE '⚠️ 주의: 이것은 테스트 목적입니다.';
  RAISE NOTICE '🔓 모든 사용자가 모든 데이터에 접근할 수 있습니다.';
  RAISE NOTICE '';
  RAISE NOTICE '💡 이제 브라우저를 새로고침하고 로그인을 시도하세요.';
  RAISE NOTICE '';
  RAISE NOTICE '📝 나중에 RLS를 다시 활성화하려면:';
  RAISE NOTICE '   ALTER TABLE 테이블명 ENABLE ROW LEVEL SECURITY;';
END $$;
