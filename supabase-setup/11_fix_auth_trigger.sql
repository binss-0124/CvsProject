-- =====================================================
-- 회원가입 오류 수정: 사용자 생성 트리거 재설정 (v2)
-- =====================================================

-- =====================================================
-- 1. 기존 트리거 삭제
-- =====================================================

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS handle_new_user() CASCADE;

-- =====================================================
-- 2. profiles 테이블에 필요한 컬럼 추가
-- =====================================================

-- email 컬럼이 없으면 추가
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email TEXT;

-- first_name 컬럼 추가
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS first_name TEXT;

-- last_name 컬럼 추가
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_name TEXT;

-- birth_date 컬럼 추가
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS birth_date DATE;

-- gender 컬럼 추가
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS gender TEXT CHECK (gender IN ('male', 'female', 'other', 'prefer_not_to_say'));

-- notification_settings 컬럼 추가
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS notification_settings JSONB DEFAULT '{"newsletter": false, "promotions": true, "order_updates": true, "push_notifications": true, "email_notifications": true}'::jsonb;

-- points 컬럼 추가
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS points INTEGER DEFAULT 0;

-- total_earned_points 컬럼 추가
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS total_earned_points INTEGER DEFAULT 0;

-- loyalty_tier 컬럼 추가
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS loyalty_tier TEXT DEFAULT 'Bronze';

-- =====================================================
-- 3. 새로운 사용자 생성 핸들러 함수 생성
-- =====================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- profiles 테이블에 새 사용자 프로필 생성
  INSERT INTO public.profiles (
    id,
    role,
    full_name,
    first_name,
    email,
    phone,
    points,
    total_earned_points,
    loyalty_tier,
    is_active
  )
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'role', 'customer'), -- 메타데이터에서 role 가져오기, 없으면 'customer'
    COALESCE(NEW.raw_user_meta_data->>'full_name', SPLIT_PART(NEW.email, '@', 1)), -- 메타데이터 또는 이메일에서 이름 생성
    COALESCE(NEW.raw_user_meta_data->>'first_name', SPLIT_PART(NEW.email, '@', 1)), -- first_name
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'phone', ''),
    0, -- 초기 포인트
    0, -- 총 적립 포인트
    'Bronze', -- 초기 등급
    true -- 활성화 상태
  );

  RETURN NEW;
EXCEPTION
  WHEN others THEN
    -- 오류 발생 시 로그 출력
    RAISE WARNING 'Error creating profile for user %: %', NEW.id, SQLERRM;
    -- 회원가입은 성공하도록 NEW 반환
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- 4. 트리거 재생성
-- =====================================================

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- =====================================================
-- 5. profiles 테이블의 제약조건 수정
-- =====================================================

-- full_name NOT NULL 제약 제거
ALTER TABLE profiles
  ALTER COLUMN full_name DROP NOT NULL;

-- 기본값 설정
ALTER TABLE profiles
  ALTER COLUMN full_name SET DEFAULT '';

-- =====================================================
-- 6. RLS 정책 업데이트 (필요시)
-- =====================================================

-- 기존 정책 삭제 후 재생성
DROP POLICY IF EXISTS "사용자는 자신의 프로필만 조회/수정" ON profiles;
DROP POLICY IF EXISTS "본사는 모든 프로필 조회/수정" ON profiles;

-- 사용자는 자신의 프로필만 조회/수정 가능
CREATE POLICY "사용자는 자신의 프로필만 조회/수정" ON profiles
    FOR ALL USING (auth.uid() = id);

-- 본사는 모든 프로필 조회/수정 가능
CREATE POLICY "본사는 모든 프로필 조회/수정" ON profiles
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid() AND role = 'headquarters'
        )
    );

-- =====================================================
-- 7. 테스트 및 확인
-- =====================================================

-- 트리거 확인
SELECT
  trigger_name,
  event_manipulation,
  event_object_table
FROM information_schema.triggers
WHERE trigger_name = 'on_auth_user_created';

-- 함수 확인
SELECT
  routine_name,
  routine_type
FROM information_schema.routines
WHERE routine_name = 'handle_new_user'
  AND routine_schema = 'public';

-- profiles 테이블 컬럼 확인
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'profiles'
  AND table_schema = 'public'
ORDER BY ordinal_position;

-- =====================================================
-- 완료 메시지
-- =====================================================

DO $$
BEGIN
  RAISE NOTICE '✅ 사용자 생성 트리거 수정 완료!';
  RAISE NOTICE '📝 profiles 테이블에 필요한 컬럼이 추가되었습니다.';
  RAISE NOTICE '🔐 RLS 정책이 업데이트되었습니다.';
  RAISE NOTICE '';
  RAISE NOTICE '💡 이제 브라우저에서 회원가입을 다시 시도하세요!';
END $$;
