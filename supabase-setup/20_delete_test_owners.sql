-- =====================================================
-- 테스트 점주 계정 삭제
-- =====================================================

-- =====================================================
-- 1. 삭제할 계정 확인
-- =====================================================

SELECT
  p.id,
  p.email,
  p.full_name,
  p.role,
  s.id as store_id,
  s.name as store_name
FROM profiles p
LEFT JOIN stores s ON s.owner_id = p.id
WHERE p.email IN ('owner1@test.com', 'owner2@test.com')
ORDER BY p.email;

-- =====================================================
-- 2. 연결된 데이터 삭제 (순서 중요!)
-- =====================================================

-- 2.1 해당 점주의 지점 상품 삭제
DELETE FROM store_products
WHERE store_id IN (
  SELECT s.id FROM stores s
  JOIN profiles p ON s.owner_id = p.id
  WHERE p.email IN ('owner1@test.com', 'owner2@test.com')
);

-- 2.2 해당 점주의 지점 삭제
DELETE FROM stores
WHERE owner_id IN (
  SELECT id FROM profiles
  WHERE email IN ('owner1@test.com', 'owner2@test.com')
);

-- 2.3 프로필 삭제
DELETE FROM profiles
WHERE email IN ('owner1@test.com', 'owner2@test.com');

-- 2.4 auth.users에서도 삭제 (Supabase Auth)
-- 주의: auth.users는 직접 삭제할 수 없을 수 있습니다.
-- 대신 Supabase 대시보드의 Authentication > Users 메뉴에서 수동으로 삭제해야 합니다.

-- =====================================================
-- 3. 삭제 확인
-- =====================================================

-- 삭제된 계정이 없는지 확인
SELECT
  p.id,
  p.email,
  p.full_name
FROM profiles p
WHERE p.email IN ('owner1@test.com', 'owner2@test.com');

-- 결과: 0 rows (삭제 성공)

-- =====================================================
-- 완료 메시지
-- =====================================================

DO $$
BEGIN
  RAISE NOTICE '✅ 테스트 점주 계정 삭제 완료!';
  RAISE NOTICE '📧 삭제된 이메일:';
  RAISE NOTICE '   - owner1@test.com';
  RAISE NOTICE '   - owner2@test.com';
  RAISE NOTICE '';
  RAISE NOTICE '⚠️ 중요: Supabase 대시보드에서도 삭제해야 합니다:';
  RAISE NOTICE '   1. Authentication > Users 메뉴로 이동';
  RAISE NOTICE '   2. owner1@test.com, owner2@test.com 검색';
  RAISE NOTICE '   3. 각 사용자의 ... 메뉴 > Delete user 클릭';
  RAISE NOTICE '';
  RAISE NOTICE '💡 이제 웹에서 새로 회원가입할 수 있습니다!';
END $$;
