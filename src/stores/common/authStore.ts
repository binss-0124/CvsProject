import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { User, UserProfile, UserRole } from '../../types/common';
import { supabase } from '../../lib/supabase/client';

interface AuthState {
  user: User | null;
  profile: UserProfile | null;
  session: any | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  
  // Actions
  signIn: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  signUp: (email: string, password: string, userData?: any) => Promise<{ success: boolean; error?: string }>;
  signOut: () => Promise<{ success: boolean; error?: string }>;
  changePassword: (newPassword: string) => Promise<{ success: boolean; error?: string }>;
  refreshUser: () => Promise<void>;
  loadProfile: (userId: string) => Promise<void>;
  clearAuth: () => void;
  setLoading: (loading: boolean) => void;
  initializeSession: () => Promise<void>;
  checkEmailExists: (email: string) => Promise<{ exists: boolean; error?: string }>;
  forceSignOut: () => void;
}

export const useAuthStore = create<AuthState>()(
  subscribeWithSelector((set, get) => ({
    user: null,
    profile: null,
    session: null,
    isLoading: false,
    isAuthenticated: false,

    setLoading: (loading: boolean) => {
      set({ isLoading: loading });
    },

    clearAuth: () => {
      console.log('🧹 인증 상태 초기화');
      
      // 로컬 스토리지 정리
      try {
        localStorage.removeItem('supabase.auth.token');
        localStorage.removeItem('sb-esbjgvnlqzseomhbsimz-auth-token');
        // 다른 가능한 키들도 정리
        Object.keys(localStorage).forEach(key => {
          if (key.includes('supabase') || key.includes('auth') || key.includes('sb-')) {
            localStorage.removeItem(key);
          }
        });
        console.log('✅ 로컬 스토리지 정리 완료');
      } catch (error) {
        console.warn('⚠️ 로컬 스토리지 정리 실패:', error);
      }

      // 세션 스토리지 정리
      try {
        sessionStorage.clear();
        console.log('✅ 세션 스토리지 정리 완료');
      } catch (error) {
        console.warn('⚠️ 세션 스토리지 정리 실패:', error);
      }

      // Zustand 상태 정리
      set({ 
        user: null, 
        profile: null, 
        session: null,
        isAuthenticated: false,
        isLoading: false,
      });
      
      console.log('✅ 모든 인증 상태 정리 완료');
    },

    initializeSession: async () => {
      try {
        console.log('🔄 세션 초기화 시작');
        
        // 현재 세션 확인
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) {
          console.error('❌ 세션 확인 실패:', error);
          get().clearAuth();
          return;
        }

        if (session?.user) {
          console.log('✅ 활성 세션 발견:', session.user.email);
          
          // 세션 설정
          set({ session });
          
          // 사용자 정보 설정
          const userData: User = {
            id: session.user.id,
            email: session.user.email || '',
            role: session.user.user_metadata?.role || 'customer',
            status: session.user.user_metadata?.status || 'active',
            created_at: session.user.created_at,
            updated_at: session.user.updated_at || session.user.created_at,
          };

          set({ 
            user: userData,
            isAuthenticated: true,
            session: session
          });

          // 프로필 로드 (비동기)
          get().loadProfile(session.user.id).catch(error => {
            console.error('⚠️ 프로필 로드 실패:', error);
          });
        } else {
          console.log('🔍 활성 세션 없음');
          get().clearAuth();
        }
      } catch (error) {
        console.error('❌ 세션 초기화 실패:', error);
        get().clearAuth();
      }
    },

    signIn: async (email: string, password: string) => {
      try {
        console.log('🔐 로그인 시작:', email);
        set({ isLoading: true });
        
        const { data, error } = await supabase.auth.signInWithPassword({ 
          email, 
          password 
        });
        
        if (error) {
          console.error('❌ 로그인 실패:', error);
          return { success: false, error: error.message };
        }

        if (data.user && data.session) {
          console.log('✅ 로그인 성공:', data.user.email);
          
          // 세션 설정
          set({ session: data.session });
          
          // 사용자 정보 설정
          const userData: User = {
            id: data.user.id,
            email: data.user.email || '',
            role: data.user.user_metadata?.role || 'customer',
            status: data.user.user_metadata?.status || 'active',
            created_at: data.user.created_at,
            updated_at: data.user.updated_at || data.user.created_at,
          };

          set({ 
            user: userData,
            isAuthenticated: true,
            session: data.session
          });

          // 프로필 로드 (비동기)
          get().loadProfile(data.user.id).catch(error => {
            console.error('⚠️ 프로필 로드 실패:', error);
          });
          
          return { success: true };
        }

        return { success: false, error: '로그인 정보를 가져올 수 없습니다.' };
      } catch (error) {
        console.error('❌ 로그인 예외:', error);
        return { 
          success: false, 
          error: error instanceof Error ? error.message : '로그인 중 오류가 발생했습니다.' 
        };
      } finally {
        set({ isLoading: false });
      }
    },

    signUp: async (email: string, password: string, userData?: any) => {
      try {
        console.log('🚀 회원가입 시작');
        console.log('📧 이메일:', email);
        console.log('👤 사용자 데이터:', userData);
        set({ isLoading: true });
        
        // 1. Supabase Auth에 사용자 생성
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: userData?.first_name && userData?.last_name 
                ? `${userData.first_name} ${userData.last_name}` 
                : '',
              role: userData?.role || 'customer',
              ...userData
            }
          }
        });
        
        if (error) {
          console.error('❌ 회원가입 오류:', error);
          
          // 사용자 친화적인 오류 메시지 처리
          let errorMessage = error.message;
          if (error.message.includes('User already registered')) {
            errorMessage = '이미 등록된 이메일입니다. 로그인을 시도해주세요.';
          } else if (error.message.includes('Password should be at least')) {
            errorMessage = '비밀번호는 최소 6자 이상이어야 합니다.';
          } else if (error.message.includes('Invalid email')) {
            errorMessage = '올바른 이메일 형식을 입력해주세요.';
          }
          
          return { success: false, error: errorMessage };
        }

        if (data.user) {
          console.log('✅ 사용자 생성 완료:', data.user.id);
          
          // 2. profiles 테이블에 프로필 생성
          const firstName = userData?.first_name || '사용자';
          const lastName = userData?.last_name || '';
          const fullName = lastName ? `${firstName} ${lastName}` : firstName;
          
          const profileData = {
            id: data.user.id,
            role: userData?.role || 'customer',
            full_name: fullName,
            first_name: firstName,
            last_name: lastName || null,
            email: email, // 회원가입 시 사용된 이메일 직접 사용
            phone: userData?.phone || null,
            avatar_url: null,
            birth_date: userData?.birth_date || null,
            gender: userData?.gender || 'prefer_not_to_say',
            notification_settings: {
              email_notifications: true,
              push_notifications: true,
              order_updates: true,
              promotions: true,
              newsletter: false
            },
            is_active: true // 기본적으로 활성 상태
          };

          console.log('📋 프로필 데이터:', profileData);

          // 트리거가 이미 프로필을 생성했을 수 있으므로 upsert 사용
          const { error: profileError } = await supabase
            .from('profiles')
            .upsert([profileData], {
              onConflict: 'id',
              ignoreDuplicates: false
            });

          if (profileError) {
            console.error('❌ 프로필 업데이트 오류:', profileError);
            console.error('❌ 프로필 업데이트 오류 상세:', {
              message: profileError.message,
              details: profileError.details,
              hint: profileError.hint,
              code: profileError.code
            });
            console.error('❌ 프로필 데이터 확인:', profileData);

            // 프로필 업데이트가 실패해도 트리거로 생성된 프로필이 있을 수 있으므로 경고만 출력
            console.warn('⚠️ 프로필 업데이트 실패했지만 계속 진행합니다.');
          } else {
            console.log('✅ 프로필 생성/업데이트 완료');
          }

          // 3. 점주인 경우 지점 생성
          if (userData?.role === 'store_owner' && userData?.storeName) {
            console.log('🏪 점주 회원가입 - 지점 생성 시작');
            console.log('👤 사용자 ID:', data.user.id);
            console.log('🏪 지점명:', userData.storeName);
            
            // 주소 정보 구성 - 상세주소 포함
            const fullAddress = userData.storeAddressDetail 
              ? `${userData.storeAddress} ${userData.storeAddressDetail}`.trim()
              : userData.storeAddress;

            const storeData = {
              name: userData.storeName,
              owner_id: data.user.id,
              address: fullAddress,
              phone: userData.storePhone,
              business_hours: {
                "monday": { "open": "07:00", "close": "23:00" },
                "tuesday": { "open": "07:00", "close": "23:00" },
                "wednesday": { "open": "07:00", "close": "23:00" },
                "thursday": { "open": "07:00", "close": "23:00" },
                "friday": { "open": "07:00", "close": "23:00" },
                "saturday": { "open": "07:00", "close": "23:00" },
                "sunday": { "open": "07:00", "close": "23:00" }
              },
              location: `POINT(127.0 37.5)`, // 기본 위치 (서울)
              delivery_available: true,
              pickup_available: true,
              is_active: true
            };

            console.log('📋 지점 데이터:', storeData);

            try {
              // 지점 생성 시도
              console.log('🔄 지점 생성 시도...');
              const { data: storeResult, error: storeError } = await supabase
                .from('stores')
                .insert([storeData])
                .select();

              if (storeError) {
                console.error('❌ 지점 생성 오류:', storeError);
                console.error('❌ 오류 코드:', storeError.code);
                console.error('❌ 오류 메시지:', storeError.message);
                console.error('❌ 오류 상세:', storeError.details);
                
                // RLS 정책 오류인 경우 사용자에게 알림
                if (storeError.code === '42501') {
                  console.warn('⚠️ RLS 정책에 의해 지점 생성이 차단되었습니다.');
                  return { 
                    success: false, 
                    error: '지점 생성 권한이 없습니다. 관리자에게 문의해주세요.' 
                  };
                }
                
                return { 
                  success: false, 
                  error: `지점 생성 실패: ${storeError.message}` 
                };
              } else {
                console.log('✅ 지점 생성 완료:', storeResult);
                
                // 5. 새로 생성된 지점에 모든 활성 상품을 재고 0으로 등록
                console.log('🔄 신규 지점 초기 상품 등록 시작...');
                try {
                  if (storeResult && storeResult.length > 0) {
                    const createdStoreId = storeResult[0].id;
                    console.log('🏪 생성된 지점 ID:', createdStoreId);
                    
                    // 모든 활성 상품 조회
                    const { data: activeProducts, error: productsError } = await supabase
                      .from('products')
                      .select('id, base_price')
                      .eq('is_active', true);
                      
                    if (productsError) {
                      console.error('❌ 활성 상품 조회 실패:', productsError);
                    } else if (activeProducts && activeProducts.length > 0) {
                      console.log(`📦 ${activeProducts.length}개의 활성 상품 발견`);
                      
                      // 각 상품을 store_products에 재고 0으로 등록
                      const storeProductsData = activeProducts.map(product => ({
                        store_id: createdStoreId,
                        product_id: product.id,
                        price: product.base_price,
                        stock_quantity: 0,
                        safety_stock: 10,
                        max_stock: 100,
                        is_available: true,
                        discount_rate: null
                      }));
                      
                      console.log('📋 등록할 상품 데이터 (처음 3개):', storeProductsData.slice(0, 3));
                      
                      const { error: insertError } = await supabase
                        .from('store_products')
                        .insert(storeProductsData);
                        
                      if (insertError) {
                        console.error('❌ 초기 상품 등록 실패:', insertError);
                        console.error('❌ 상품 등록 오류 상세:', {
                          message: insertError.message,
                          details: insertError.details,
                          hint: insertError.hint,
                          code: insertError.code
                        });
                        // 상품 등록 실패해도 지점 생성은 성공이므로 에러로 처리하지 않음
                        console.warn('⚠️ 상품 등록은 실패했지만 지점 생성은 완료됨');
                      } else {
                        console.log('✅ 초기 상품 등록 완료!', storeProductsData.length, '개 상품 등록됨');
                      }
                    } else {
                      console.warn('⚠️ 등록할 활성 상품이 없습니다.');
                    }
                  } else {
                    console.warn('⚠️ 생성된 지점 정보를 가져올 수 없습니다.');
                  }
                } catch (productError) {
                  console.error('❌ 초기 상품 등록 중 예외:', productError);
                  // 상품 등록 실패해도 지점 생성은 성공이므로 에러로 처리하지 않음
                }
              }
            } catch (error) {
              console.error('❌ 지점 생성 중 예외 발생:', error);
              return { 
                success: false, 
                error: `지점 생성 중 오류가 발생했습니다: ${error instanceof Error ? error.message : '알 수 없는 오류'}` 
              };
            }
          }

          // 4. 이메일 확인이 필요한 경우와 즉시 로그인되는 경우 처리
          if (data.session) {
            console.log('✅ 즉시 로그인 처리');
            set({ session: data.session });
            
            // 사용자 정보 설정
            const userData: User = {
              id: data.user.id,
              email: data.user.email || '',
              role: data.user.user_metadata?.role || 'customer',
              status: data.user.user_metadata?.status || 'active',
              created_at: data.user.created_at,
              updated_at: data.user.updated_at || data.user.created_at,
            };

            set({ 
              user: userData,
              isAuthenticated: true,
              session: data.session
            });

            // 프로필 로드 (비동기)
            get().loadProfile(data.user.id).catch(error => {
              console.error('⚠️ 프로필 로드 실패:', error);
            });
          } else {
            console.log('📧 이메일 확인이 필요합니다');
          }

          console.log('🎉 회원가입 완료!');
          return { success: true };
        }

        return { success: false, error: '회원가입 정보를 처리할 수 없습니다.' };
      } catch (error) {
        console.error('❌ 회원가입 예외:', error);
        return { 
          success: false, 
          error: error instanceof Error ? error.message : '회원가입 중 오류가 발생했습니다.' 
        };
      } finally {
        set({ isLoading: false });
      }
    },

    signOut: async () => {
      try {
        console.log('🔓 로그아웃 시작');
        set({ isLoading: true });
        
        // 강제 로그아웃 (모든 방법 시도)
        try {
          // 1. 일반 로그아웃 시도
          console.log('🔄 일반 로그아웃 시도');
          await supabase.auth.signOut();
          console.log('✅ 일반 로그아웃 성공');
        } catch (error) {
          console.warn('⚠️ 일반 로그아웃 실패:', error);
          
          // 2. 전역 로그아웃 시도
          try {
            console.log('🔄 전역 로그아웃 시도');
            await supabase.auth.signOut({ scope: 'global' });
            console.log('✅ 전역 로그아웃 성공');
          } catch (globalError) {
            console.warn('⚠️ 전역 로그아웃도 실패:', globalError);
          }
        }

        // 3. 항상 로컬 상태 정리
        console.log('🧹 로컬 상태 강제 정리');
        get().clearAuth();

        console.log('✅ 로그아웃 완료');
        return { success: true };
      } catch (error) {
        console.warn('⚠️ 로그아웃 중 예외, 강제 로컬 정리:', error);
        // 모든 에러 상황에서도 로컬 상태는 정리
        get().clearAuth();
        return { success: true }; // 로컬 정리는 성공으로 처리
      } finally {
        set({ isLoading: false });
      }
    },

    // 강제 로그아웃 (모든 상황에서 작동)
    forceSignOut: () => {
      console.log('💥 강제 로그아웃 실행');
      
      try {
        // 1. 로컬 상태 강제 정리
        get().clearAuth();
        
        // 2. 추가 브라우저 상태 정리
        if (typeof window !== 'undefined') {
          // 쿠키 정리
          document.cookie.split(";").forEach(cookie => {
            const eqPos = cookie.indexOf("=");
            const name = eqPos > -1 ? cookie.substr(0, eqPos).trim() : cookie.trim();
            if (name.includes('supabase') || name.includes('auth') || name.includes('sb-')) {
              document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
            }
          });
          
          // 3. 페이지 강제 이동 (캐시 무시)
          setTimeout(() => {
            window.location.replace('/');
          }, 100);
        }
        
        console.log('✅ 강제 로그아웃 완료');
      } catch (error) {
        console.error('❌ 강제 로그아웃 중 오류:', error);
        // 그래도 페이지 이동은 시도
        if (typeof window !== 'undefined') {
          window.location.replace('/');
        }
      }
    },

    changePassword: async (newPassword: string) => {
      try {
        console.log('🔐 비밀번호 변경 시작');
        // 비밀번호 변경 시에는 전역 isLoading을 사용하지 않음 (무한 루프 방지)
        
        const { data, error } = await supabase.auth.updateUser({
          password: newPassword
        });
        
        if (error) {
          console.error('❌ 비밀번호 변경 실패:', error);
          
          // 사용자 친화적인 오류 메시지 제공
          let userFriendlyMessage = error.message;
          
          if (error.message.includes('New password should be different from the old password')) {
            userFriendlyMessage = '새 비밀번호는 현재 비밀번호와 달라야 합니다. 다른 비밀번호를 입력해주세요.';
          } else if (error.message.includes('Password should be at least')) {
            userFriendlyMessage = '비밀번호는 최소 6자 이상이어야 합니다.';
          } else if (error.message.includes('weak password')) {
            userFriendlyMessage = '비밀번호가 너무 약합니다. 더 강한 비밀번호를 사용해주세요.';
          } else if (error.message.includes('Invalid password')) {
            userFriendlyMessage = '유효하지 않은 비밀번호입니다. 비밀번호 요구사항을 확인해주세요.';
          }
          
          return { success: false, error: userFriendlyMessage };
        }

        if (data.user) {
          console.log('✅ 비밀번호 변경 성공');
          return { success: true };
        }

        return { success: false, error: '비밀번호 변경 중 오류가 발생했습니다.' };
      } catch (error) {
        console.error('❌ 비밀번호 변경 예외:', error);
        return { 
          success: false, 
          error: error instanceof Error ? error.message : '비밀번호 변경 중 오류가 발생했습니다.' 
        };
      }
    },

    refreshUser: async () => {
      try {
        console.log('🔄 refreshUser 시작');
        
        // 현재 세션 확인
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) {
          console.error('❌ 세션 확인 실패:', error);
          get().clearAuth();
          return;
        }

        if (!session?.user) {
          console.log('❌ 활성 세션 없음, 로그아웃 처리');
          get().clearAuth();
          return;
        }

        console.log('✅ 세션 확인 완료:', session.user.email);
        
        // 세션 업데이트
        set({ session });
        
        // 사용자 정보 업데이트
        const userData: User = {
          id: session.user.id,
          email: session.user.email || '',
          role: session.user.user_metadata?.role || 'customer',
          status: session.user.user_metadata?.status || 'active',
          created_at: session.user.created_at,
          updated_at: session.user.updated_at || session.user.created_at,
        };
        
        set({ 
          user: userData,
          isAuthenticated: true,
          session: session
        });

        // 프로필 정보 로드 (비동기)
        try {
          await get().loadProfile(session.user.id);
        } catch (profileError) {
          console.error('⚠️ 프로필 로드 실패:', profileError);
        }
        
        console.log('🏁 refreshUser 완료');
      } catch (error) {
        console.error('❌ refreshUser 예외 발생:', error);
        get().clearAuth();
      }
    },

    loadProfile: async (userId: string) => {
      try {
        console.log('🔍 프로필 로드 시작 - userId:', userId);
        
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .single();

        if (error) {
          console.error('❌ 프로필 로드 실패:', error);
          
          // 프로필 로드 실패 시에도 기본 역할 설정 (본사 계정의 경우)
          const currentUser = get().user;
          if (currentUser && currentUser.email === 'hq@example.com') {
            console.log('🏢 본사 계정 감지, 기본 역할 설정 중...');
            set({ 
              user: {
                ...currentUser,
                role: 'headquarters'
              }
            });
            console.log('✅ 본사 계정 기본 역할 설정 완료');
          }
          return;
        }

        if (data) {
          console.log('✅ 프로필 데이터 로드 성공:', data.full_name, data.role);
          
          const profileData: UserProfile = {
            id: data.id,
            user_id: data.id,
            first_name: data.first_name || data.full_name?.split(' ')[0] || '',
            last_name: data.last_name || data.full_name?.split(' ')[1] || '',
            email: data.email || undefined,
            phone: data.phone || undefined,
            avatar_url: data.avatar_url || undefined,
            birth_date: data.birth_date || undefined,
            gender: data.gender || undefined,
            notification_settings: data.notification_settings || undefined,
            created_at: data.created_at || '',
            updated_at: data.updated_at || '',
          };

          // 사용자 역할을 데이터베이스에서 가져온 실제 역할로 업데이트
          set({ 
            profile: profileData,
            user: {
              ...get().user!,
              role: data.role as UserRole
            }
          });
          console.log('✅ 프로필 및 사용자 역할 상태 업데이트 완료');
        } else {
          console.log('⚠️ 프로필 데이터 없음');
          // 프로필이 없어도 기본 역할 설정 (본사 계정의 경우)
          const currentUser = get().user;
          if (currentUser && currentUser.email === 'hq@example.com') {
            set({ 
              user: {
                ...currentUser,
                role: 'headquarters'
              }
            });
            console.log('✅ 본사 계정 기본 역할 설정 완료');
          }
        }
      } catch (error) {
        console.error('❌ 프로필 로드 중 예외 발생:', error);
      }
    },

    checkEmailExists: async (email: string) => {
      try {
        console.log('📧 이메일 중복 확인:', email);
        
        // 1. 먼저 profiles 테이블에서 이메일 존재 여부 확인 (더 안전한 방법)
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('id')
          .eq('email', email)
          .maybeSingle(); // single() 대신 maybeSingle() 사용하여 에러 방지
        
        if (profileError) {
          console.error('프로필 조회 중 오류:', profileError);
          // 프로필 테이블 조회가 실패해도 계속 진행
        }
        
        // 프로필 테이블에 이메일이 있으면 중복
        if (profileData) {
          console.log('✅ 이메일 중복 확인 완료: profiles 테이블에 존재함');
          return { exists: true };
        }
        
        // 2. auth.users 테이블도 확인 (RLS 때문에 직접 확인하기 어려우므로 함수 사용)
        const { data: functionData, error: functionError } = await supabase
          .rpc('check_email_exists', { check_email: email });
        
        if (functionError) {
          console.warn('이메일 확인 함수 호출 실패:', functionError);
          // 함수가 없거나 실행 실패 시 기본값으로 false 반환
          return { exists: false };
        }
        
        const exists = functionData === true;
        console.log(`✅ 이메일 중복 확인 완료: ${exists ? '이미 존재함' : '사용 가능'}`);
        return { exists };
        
      } catch (error) {
        console.error('❌ 이메일 중복 확인 실패:', error);
        return { 
          exists: false, 
          error: error instanceof Error ? error.message : '이메일 확인 중 오류가 발생했습니다.' 
        };
      }
    },
  }))
);

// 초기 인증 설정
export const initializeAuth = async (): Promise<void> => {
  const store = useAuthStore.getState();
  
  try {
    console.log('🔐 초기 인증 설정 시작');
    store.setLoading(true);
    
    // 현재 세션 확인
    const { data: { session }, error } = await supabase.auth.getSession();
    
    if (error) {
      console.error('❌ 세션 확인 실패:', error);
      store.clearAuth();
      return;
    }

    if (session?.user) {
      console.log('✅ 저장된 세션 발견:', session.user.email);
      
      // 즉시 사용자 정보 설정
      const userData: User = {
        id: session.user.id,
        email: session.user.email || '',
        role: session.user.user_metadata?.role || 'customer',
        status: session.user.user_metadata?.status || 'active',
        created_at: session.user.created_at,
        updated_at: session.user.updated_at || session.user.created_at,
      };

      // 상태 즉시 업데이트
      store.user = userData;
      store.isAuthenticated = true;
      store.session = session;
      store.isLoading = false;

      console.log('✅ 사용자 정보 설정 완료:', userData.email, userData.role);

      // 프로필 로드는 비동기로 처리하되, 실패해도 인증은 유지
      try {
        await store.loadProfile(session.user.id);
        console.log('✅ 프로필 로드 완료');
      } catch (profileError) {
        console.error('⚠️ 프로필 로드 실패 (인증은 유지):', profileError);
        // 프로필 로드 실패해도 인증 상태는 유지
      }
    } else {
      console.log('🔍 저장된 세션 없음');
      store.clearAuth();
    }
    
  } catch (error) {
    console.error('❌ 초기 인증 설정 실패:', error);
    store.clearAuth();
  } finally {
    console.log('🏁 초기 인증 설정 완료');
    store.setLoading(false);
  }
};

// 세션 변경 감지
supabase.auth.onAuthStateChange(async (event, session) => {
  const store = useAuthStore.getState();
  
  console.log('🔔 Auth state changed:', event, session?.user?.email);
  
  switch (event) {
    case 'SIGNED_IN':
      if (session?.user) {
        console.log('🔐 로그인 이벤트 처리');
        // 즉시 사용자 정보 설정
        const userData: User = {
          id: session.user.id,
          email: session.user.email || '',
          role: session.user.user_metadata?.role || 'customer',
          status: session.user.user_metadata?.status || 'active',
          created_at: session.user.created_at,
          updated_at: session.user.updated_at || session.user.created_at,
        };

        store.user = userData;
        store.isAuthenticated = true;
        store.session = session;
        store.isLoading = false;

        // 프로필 로드는 비동기로 처리
        store.loadProfile(session.user.id).catch(error => {
          console.error('⚠️ 프로필 로드 실패:', error);
        });
      }
      break;
      
    case 'SIGNED_OUT':
      console.log('🔓 로그아웃 이벤트 처리');
      store.clearAuth();
      break;
      
    case 'TOKEN_REFRESHED':
      if (session) {
        console.log('🔄 토큰 갱신 이벤트 처리');
        store.session = session;
      }
      break;
      
    case 'USER_UPDATED':
      // 비밀번호 변경으로 인한 USER_UPDATED 이벤트는 무시 (무한 루프 방지)
      console.log('👤 사용자 정보 업데이트 이벤트 - 비밀번호 변경으로 인한 이벤트는 무시');
      if (session) {
        // 세션만 업데이트하고 refreshUser는 호출하지 않음
        store.session = session;
      }
      break;
      
    default:
      console.log('📝 기타 인증 이벤트:', event);
  }
});

export default useAuthStore;