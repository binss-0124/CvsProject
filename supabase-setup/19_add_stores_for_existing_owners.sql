-- =====================================================
-- 기존 점주 계정에 지점 추가
-- =====================================================

-- =====================================================
-- 1. 점주 계정 확인 (지점이 없는 점주 찾기)
-- =====================================================

SELECT
  p.id,
  p.full_name,
  p.email,
  p.phone,
  p.created_at,
  s.id as store_id,
  s.name as store_name
FROM profiles p
LEFT JOIN stores s ON s.owner_id = p.id
WHERE p.role = 'store_owner'
ORDER BY p.created_at DESC;

-- =====================================================
-- 2. 지점이 없는 점주들을 위한 기본 지점 생성
-- =====================================================

-- 각 점주마다 기본 지점 생성
INSERT INTO stores (
  name,
  owner_id,
  address,
  phone,
  business_hours,
  location,
  delivery_available,
  pickup_available,
  delivery_radius,
  min_order_amount,
  delivery_fee,
  is_active
)
SELECT
  p.full_name || '의 편의점' as name,
  p.id as owner_id,
  '서울특별시 강남구 테헤란로 123' as address,
  COALESCE(p.phone, '02-1234-5678') as phone,
  '{
    "monday": {"open": "00:00", "close": "24:00"},
    "tuesday": {"open": "00:00", "close": "24:00"},
    "wednesday": {"open": "00:00", "close": "24:00"},
    "thursday": {"open": "00:00", "close": "24:00"},
    "friday": {"open": "00:00", "close": "24:00"},
    "saturday": {"open": "00:00", "close": "24:00"},
    "sunday": {"open": "00:00", "close": "24:00"}
  }'::jsonb as business_hours,
  ST_SetSRID(ST_MakePoint(127.0276, 37.4979), 4326)::geography as location,
  true as delivery_available,
  true as pickup_available,
  3000 as delivery_radius,
  10000 as min_order_amount,
  3000 as delivery_fee,
  true as is_active
FROM profiles p
LEFT JOIN stores s ON s.owner_id = p.id
WHERE p.role = 'store_owner'
  AND s.id IS NULL  -- 지점이 없는 점주만
ON CONFLICT DO NOTHING;

-- =====================================================
-- 3. 생성된 지점에 기본 상품 추가
-- =====================================================

-- 새로 생성된 지점에 모든 활성 상품 추가
INSERT INTO store_products (
  store_id,
  product_id,
  price,
  stock_quantity,
  safety_stock,
  max_stock,
  is_available
)
SELECT
  s.id as store_id,
  p.id as product_id,
  p.base_price as price,
  50 as stock_quantity,  -- 기본 재고 50개
  10 as safety_stock,
  100 as max_stock,
  true as is_available
FROM stores s
CROSS JOIN products p
WHERE s.id NOT IN (
  -- 이미 상품이 등록된 지점은 제외
  SELECT DISTINCT store_id FROM store_products
)
AND p.is_active = true
AND NOT EXISTS (
  -- 중복 방지: 이미 등록된 조합은 제외
  SELECT 1 FROM store_products sp
  WHERE sp.store_id = s.id AND sp.product_id = p.id
);

-- =====================================================
-- 4. 결과 확인
-- =====================================================

-- 점주별 지점 확인
SELECT
  p.id as owner_id,
  p.full_name as owner_name,
  p.email,
  s.id as store_id,
  s.name as store_name,
  s.address,
  COUNT(sp.id) as product_count
FROM profiles p
LEFT JOIN stores s ON s.owner_id = p.id
LEFT JOIN store_products sp ON sp.store_id = s.id
WHERE p.role = 'store_owner'
GROUP BY p.id, p.full_name, p.email, s.id, s.name, s.address
ORDER BY p.created_at DESC;

-- =====================================================
-- 완료 메시지
-- =====================================================

DO $$
DECLARE
  store_count INTEGER;
  owner_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO owner_count FROM profiles WHERE role = 'store_owner';
  SELECT COUNT(*) INTO store_count FROM stores;

  RAISE NOTICE '✅ 기존 점주 계정에 지점 추가 완료!';
  RAISE NOTICE '📊 총 점주 계정: %개', owner_count;
  RAISE NOTICE '🏪 총 지점: %개', store_count;
  RAISE NOTICE '';
  RAISE NOTICE '💡 브라우저를 새로고침하고 로그인하세요!';
END $$;
