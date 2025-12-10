-- =====================================================
-- 누락된 스키마 수정
-- =====================================================

-- =====================================================
-- 1. points 테이블 생성
-- =====================================================

CREATE TABLE IF NOT EXISTS points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL, -- 포인트 금액 (양수: 적립, 음수: 사용)
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('earned', 'used', 'expired', 'refunded')),
  description TEXT NOT NULL,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ, -- 포인트 만료일 (적립 시에만)
  is_expired BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_points_user_id ON points(user_id);
CREATE INDEX IF NOT EXISTS idx_points_order_id ON points(order_id);
CREATE INDEX IF NOT EXISTS idx_points_created_at ON points(created_at);
CREATE INDEX IF NOT EXISTS idx_points_expires_at ON points(expires_at);

-- 코멘트 추가
COMMENT ON TABLE points IS '포인트 거래 내역';
COMMENT ON COLUMN points.amount IS '포인트 금액 (양수: 적립, 음수: 사용)';
COMMENT ON COLUMN points.transaction_type IS '거래 유형: earned(적립), used(사용), expired(만료), refunded(환불)';
COMMENT ON COLUMN points.expires_at IS '포인트 만료일 (적립 시에만 설정)';

-- =====================================================
-- 2. orders 테이블에 누락된 컬럼 추가
-- =====================================================

-- coupon_discount_amount 컬럼 추가
ALTER TABLE orders ADD COLUMN IF NOT EXISTS coupon_discount_amount INTEGER DEFAULT 0;

-- 기타 누락될 수 있는 컬럼들 추가
ALTER TABLE orders ADD COLUMN IF NOT EXISTS coupon_id UUID REFERENCES coupons(id) ON DELETE SET NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS points_used INTEGER DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS points_earned INTEGER DEFAULT 0;

-- 코멘트 추가
COMMENT ON COLUMN orders.coupon_discount_amount IS '쿠폰 할인 금액';
COMMENT ON COLUMN orders.coupon_id IS '사용한 쿠폰 ID';
COMMENT ON COLUMN orders.points_used IS '사용한 포인트';
COMMENT ON COLUMN orders.points_earned IS '적립된 포인트';

-- =====================================================
-- 3. points 테이블 RLS 비활성화 (테스트용)
-- =====================================================

ALTER TABLE points DISABLE ROW LEVEL SECURITY;

-- =====================================================
-- 4. updated_at 자동 업데이트 트리거
-- =====================================================

DROP TRIGGER IF EXISTS update_points_updated_at ON points;

CREATE TRIGGER update_points_updated_at
  BEFORE UPDATE ON points
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 5. 포인트 만료 처리 함수
-- =====================================================

CREATE OR REPLACE FUNCTION expire_points()
RETURNS void AS $$
BEGIN
  UPDATE points
  SET is_expired = true
  WHERE expires_at IS NOT NULL
    AND expires_at < NOW()
    AND is_expired = false
    AND transaction_type = 'earned';
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 6. 확인 쿼리
-- =====================================================

-- points 테이블 확인
SELECT
  table_name,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'points'
  AND table_schema = 'public'
ORDER BY ordinal_position;

-- orders 테이블의 새 컬럼 확인
SELECT
  column_name,
  data_type,
  column_default
FROM information_schema.columns
WHERE table_name = 'orders'
  AND table_schema = 'public'
  AND column_name IN ('coupon_id', 'coupon_discount_amount', 'points_used', 'points_earned')
ORDER BY ordinal_position;

-- =====================================================
-- 완료 메시지
-- =====================================================

DO $$
BEGIN
  RAISE NOTICE '✅ 누락된 스키마 수정 완료!';
  RAISE NOTICE '📊 points 테이블 생성됨';
  RAISE NOTICE '💰 orders 테이블에 쿠폰/포인트 컬럼 추가됨';
  RAISE NOTICE '';
  RAISE NOTICE '💡 브라우저를 새로고침하고 다시 확인하세요!';
END $$;
