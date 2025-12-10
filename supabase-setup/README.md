# Supabase 데이터베이스 설정 파일

이 폴더에는 Supabase 데이터베이스를 처음부터 설정하기 위한 SQL 스크립트들이 포함되어 있습니다.

## 📋 초기 설정 순서 (새 프로젝트 시작 시)

새로운 Supabase 프로젝트를 시작할 때 다음 순서대로 실행하세요:

### 1. 필수 기본 설정 (순서대로 실행)

```
01_extensions_advanced.sql       # PostgreSQL 확장 기능 활성화 (UUID, PostGIS 등)
02_schema_advanced.sql           # 기본 테이블 생성 (profiles, products, stores, orders 등)
03_functions_advanced.sql        # 데이터베이스 함수 생성
04_triggers_advanced.sql         # 트리거 설정
05_rls_policies_advanced.sql     # Row Level Security 정책 (현재 비활성화됨)
06_seed_data_advanced.sql        # 초기 데이터 (카테고리, 상품 등)
```

### 2. 추가 기능 설정

```
09_additional_tables.sql         # 추가 테이블 (wishlists, coupons, refunds, promotions 등)
11_fix_auth_trigger.sql          # 회원가입 시 프로필 자동 생성 트리거
17_disable_rls_temp.sql          # RLS 임시 비활성화 (테스트용)
18_fix_missing_schema.sql        # 누락된 테이블/컬럼 추가 (points, order 컬럼들)
```

## 🛠️ 유틸리티 스크립트

### 사용자 관리

```
19_add_stores_for_existing_owners.sql   # 기존 점주 계정에 지점 자동 생성
20_delete_test_owners.sql               # 테스트 계정 삭제
```

## 🚀 빠른 시작 가이드

### 1단계: 기본 데이터베이스 설정

Supabase SQL Editor에서 다음 파일들을 순서대로 실행:

1. `01_extensions_advanced.sql`
2. `02_schema_advanced.sql`
3. `03_functions_advanced.sql`
4. `04_triggers_advanced.sql`
5. `06_seed_data_advanced.sql` (05는 건너뜀 - RLS 사용 안 함)

### 2단계: 추가 기능 설정

```sql
-- 추가 테이블 생성
09_additional_tables.sql

-- 회원가입 트리거 설정
11_fix_auth_trigger.sql

-- RLS 비활성화 (테스트용)
17_disable_rls_temp.sql

-- 누락된 스키마 추가
18_fix_missing_schema.sql
```

## 📝 주요 테이블 구조

### 핵심 테이블

- **profiles**: 사용자 프로필 (고객, 점주, 본사)
- **stores**: 편의점 지점 정보
- **products**: 상품 정보
- **categories**: 상품 카테고리
- **store_products**: 지점별 상품 재고
- **orders**: 주문 정보
- **order_items**: 주문 상세 항목

### 추가 테이블

- **points**: 포인트 거래 내역
- **coupons**: 쿠폰 정보
- **user_coupons**: 사용자별 쿠폰 소유
- **wishlists**: 위시리스트
- **refunds**: 환불 정보
- **promotions**: 프로모션/이벤트

## 🔐 보안 참고사항

현재 **RLS(Row Level Security)가 비활성화**되어 있습니다. 이는 테스트 목적이며, 프로덕션 환경에서는 적절한 RLS 정책을 설정해야 합니다.

---

**마지막 업데이트**: 2025-01-06
