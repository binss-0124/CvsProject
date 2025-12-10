import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { supabase } from '../lib/supabase/client';
import { atomicInventoryDeduction, atomicInventoryRestoration, type InventoryItem } from '../lib/inventory/inventoryManager';
import type { Product, StoreProduct } from '../types/common';

export interface OrderItem {
  productId: string;
  productName: string;
  quantity: number;
  price: number;
  discountRate: number;
  subtotal: number;
}

export interface DeliveryAddress {
  name: string;
  phone: string;
  address: string;
  detailAddress: string;
  memo?: string;
}

export interface Order {
  id: string;
  orderNumber: string;
  storeId: string;
  storeName: string;
  orderType: 'pickup' | 'delivery';
  items: OrderItem[];
  deliveryAddress?: DeliveryAddress;
  paymentMethod: 'card' | 'cash' | 'mobile' | 'toss' | 'naver' | 'payco';
  paymentStatus?: 'pending' | 'paid' | 'failed' | 'refunded';
  subtotal: number;
  taxAmount: number;
  deliveryFee: number;
  totalAmount: number;
  // 포인트 정보 추가
  pointsUsed?: number;
  pointsDiscountAmount?: number;
  // 쿠폰 정보 추가
  couponDiscountAmount?: number;
  appliedCouponId?: string;
  status: 'pending' | 'confirmed' | 'preparing' | 'ready' | 'delivering' | 'completed' | 'cancelled';
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

interface OrderState {
  orders: Order[];
  isLoading: boolean;
  error: string | null;
  addOrder: (order: Omit<Order, 'id' | 'updatedAt'>) => Promise<Order>;
  updateOrderStatus: (orderId: string, status: Order['status']) => Promise<void>;
  fetchOrders: () => Promise<void>;
  subscribeToOrders: () => void;
  unsubscribeFromOrders: () => void;
  getOrderById: (orderId: string) => Order | undefined;
  getOrdersByStatus: (status: Order['status']) => Order[];
  clearOrders: () => void;
}

let orderSubscription: any = null;

export const useOrderStore = create<OrderState>()(
  persist(
    (set, get) => ({
      orders: [],
      isLoading: false,
      error: null,

      addOrder: async (orderData) => {
        set({ isLoading: true, error: null });
        
        try {
          console.log('📝 Supabase에 주문 저장 중...', orderData);
          console.log('🔍 paymentMethod 값:', orderData.paymentMethod);
          console.log('🔍 paymentMethod 타입:', typeof orderData.paymentMethod);
          console.log('🔍 orderData 전체 구조:', JSON.stringify(orderData, null, 2));

          // 현재 로그인한 사용자 ID 가져오기
          const { data: { user }, error: authError } = await supabase.auth.getUser();
          console.log('🔐 인증 상태 확인:', { user: user?.id, email: user?.email, authError });
          
          if (!user) {
            console.error('❌ 로그인되지 않은 사용자');
            throw new Error('로그인이 필요합니다.');
          }
          
          console.log('✅ 인증된 사용자:', user.id);

          // 쿠폰 코드로 쿠폰 ID 가져오기
          const getCouponIdByCode = async (couponCode: string): Promise<string | null> => {
            try {
              // coupons 테이블에서 쿠폰 ID 조회
              const { data: couponData, error: couponError } = await supabase
                .from('coupons')
                .select('id')
                .eq('code', couponCode)
                .single();
              
              if (couponError) {
                console.warn('⚠️ 쿠폰 ID 조회 실패:', couponError);
                return null;
              }
              
              console.log('✅ 쿠폰 ID 조회 성공:', { couponCode, couponId: couponData.id });
              return couponData.id; // coupons 테이블의 ID 반환
            } catch (error) {
              console.warn('⚠️ 쿠폰 ID 조회 중 오류:', error);
              return null;
            }
          };

          // 결제 방법을 스키마에 맞게 매핑
          const mapPaymentMethod = (method: string): string => {
            const mapping: Record<string, string> = {
              'card': 'card',
              'cash': 'cash',
              'toss': 'toss_pay',
              'naver': 'card', // 네이버페이는 카드로 매핑
              'payco': 'card', // 페이코는 카드로 매핑
              'mobile': 'card', // 휴대폰 결제는 카드로 매핑
            };
            console.log('🔍 결제 방법 매핑:', { 원본: method, 매핑됨: mapping[method] || 'card' });
            return mapping[method] || 'card';
          };

          // 주문 데이터 준비 (소수점 단위 금액을 반올림으로 처리)
          const insertData = {
            order_number: orderData.orderNumber,
            customer_id: user.id, // 현재 로그인한 사용자 ID
            store_id: orderData.storeId,
            type: orderData.orderType, // order_type → type
            delivery_address: orderData.deliveryAddress ? JSON.stringify(orderData.deliveryAddress) : null,
            payment_method: mapPaymentMethod(orderData.paymentMethod),
            subtotal: Math.round(orderData.subtotal),
            tax_amount: Math.round(orderData.taxAmount),
            delivery_fee: Math.round(orderData.deliveryFee),
            total_amount: Math.round(orderData.totalAmount),
            // 포인트 정보 추가
            points_used: (orderData as any).pointsUsed || 0,
            points_discount_amount: Math.round((orderData as any).pointsDiscountAmount || 0),
            // 쿠폰 정보 추가
            coupon_discount_amount: Math.round((orderData as any).couponDiscount || 0),
            applied_coupon_id: (orderData as any).selectedCoupon ? await getCouponIdByCode((orderData as any).selectedCoupon) : null,
            status: orderData.status,
            payment_status: 'paid', // 결제 성공 페이지에서 호출되므로 paid로 설정
            payment_data: null, // paymentResult 필드 제거됨
          };

          console.log('🔍 쿠폰 정보 디버깅:', {
            selectedCoupon: (orderData as any).selectedCoupon,
            couponDiscount: (orderData as any).couponDiscount,
            couponDiscountRounded: Math.round((orderData as any).couponDiscount || 0),
            appliedCouponId: insertData.applied_coupon_id
          });

          console.log('📦 Supabase에 삽입할 데이터:', insertData);
          console.log('🔍 원본 paymentMethod:', orderData.paymentMethod);
          console.log('🔍 매핑된 paymentMethod:', mapPaymentMethod(orderData.paymentMethod));

          // Supabase에 주문 저장 (데이터베이스 스키마에 맞춤)
          const { data, error } = await supabase
            .from('orders')
            .insert(insertData)
            .select()
            .single();

          if (error) {
            console.error('❌ 주문 저장 실패:', error);
            console.error('❌ 에러 상세:', {
              message: error.message,
              details: error.details,
              hint: error.hint,
              code: error.code
            });
            throw error;
          }

          console.log('✅ 주문 저장 성공:', data);

          // 쿠폰 사용 상태 업데이트
          if (insertData.applied_coupon_id && insertData.coupon_discount_amount > 0) {
            try {
              const { error: couponUpdateError } = await supabase
                .from('user_coupons')
                .update({
                  is_used: true,
                  used_at: new Date().toISOString(),
                  used_order_id: data.id
                })
                .eq('coupon_id', insertData.applied_coupon_id)
                .eq('user_id', user.id)
                .eq('is_used', false);

              if (couponUpdateError) {
                console.warn('⚠️ 쿠폰 사용 상태 업데이트 실패:', couponUpdateError);
              } else {
                console.log('✅ 쿠폰 사용 상태 업데이트 성공');
              }
            } catch (error) {
              console.warn('⚠️ 쿠폰 상태 업데이트 중 오류:', error);
            }
          }

          // 주문 아이템들을 order_items 테이블에 저장하고 재고 차감
          if (orderData.items && orderData.items.length > 0) {
            const orderItems = orderData.items.map(item => ({
              order_id: data.id,
              product_id: item.productId,
              product_name: item.productName,
              quantity: item.quantity,
              unit_price: Math.round(item.price),
              discount_amount: Math.round(item.price * item.discountRate * item.quantity),
              subtotal: Math.round(item.subtotal)
            }));

            const { error: itemsError } = await supabase
              .from('order_items')
              .insert(orderItems);

            if (itemsError) {
              console.error('❌ 주문 아이템 저장 실패:', itemsError);
              console.error('❌ 아이템 에러 상세:', {
                message: itemsError.message,
                details: itemsError.details,
                hint: itemsError.hint,
                code: itemsError.code
              });
              // 주문 아이템 저장 실패해도 주문은 계속 진행
            } else {
              console.log('✅ 주문 아이템 저장 성공:', orderItems.length, '개');
            }

            // 원자적 재고 차감 처리
            console.log('⚛️ 원자적 재고 차감 시작...');
            if (orderData.items && orderData.items.length > 0) {
              try {
                // 주문 아이템을 InventoryItem 형식으로 변환
                const inventoryItems: InventoryItem[] = orderData.items.map(item => ({
                  productId: item.productId,
                  productName: item.productName,
                  quantity: item.quantity
                }));

                // 원자적 재고 차감 실행
                const inventoryResult = await atomicInventoryDeduction(
                  orderData.storeId,
                  inventoryItems,
                  'order',
                  data.id,
                  orderData.orderNumber,
                  user.id
                );

                if (!inventoryResult.success) {
                  // 재고 차감 실패 시 주문도 실패로 처리
                  console.error('❌ 재고 차감 실패:', inventoryResult.message);
                  console.error('❌ 재고 차감 오류 목록:', inventoryResult.errors);
                  
                  // 주문 데이터 삭제 (이미 저장된 주문을 롤백)
                  await supabase.from('orders').delete().eq('id', data.id);
                  await supabase.from('order_items').delete().eq('order_id', data.id);
                  
                  throw new Error(`재고 부족으로 주문을 처리할 수 없습니다: ${inventoryResult.message}`);
                }

                console.log('✅ 원자적 재고 차감 성공:', {
                  transactionCount: inventoryResult.transactionIds.length,
                  message: inventoryResult.message
                });

              } catch (inventoryError) {
                console.error('❌ 재고 차감 중 예외 발생:', inventoryError);
                throw inventoryError; // 재고 차감 실패 시 전체 주문 실패
              }
            }
          }

          // 포인트 차감 처리
          const pointsUsed = (orderData as any).pointsUsed || 0;
          if (pointsUsed > 0) {
            console.log('💰 포인트 차감 시작:', pointsUsed, '포인트');
            try {
              // 포인트 차감 레코드 생성
              const { error: pointError } = await supabase
                .from('points')
                .insert({
                  user_id: user.id,
                  amount: -pointsUsed, // 차감이므로 음수
                  type: 'used',
                  description: `주문 #${orderData.orderNumber}에서 포인트 사용`,
                  order_id: data.id
                });

              if (pointError) {
                console.error('❌ 포인트 차감 실패:', pointError);
                console.error('❌ 포인트 차감 오류 상세:', {
                  message: pointError.message,
                  details: pointError.details,
                  hint: pointError.hint,
                  code: pointError.code
                });
                // 포인트 차감 실패해도 주문은 계속 진행 (이미 결제 완료됨)
              } else {
                console.log('✅ 포인트 차감 완료:', pointsUsed, '포인트');
              }
            } catch (error) {
              console.error('❌ 포인트 차감 중 예외 발생:', error);
              // 포인트 차감 실패해도 주문은 계속 진행
            }
          }

          // 로컬 상태에 추가
          const newOrder: Order = {
            id: data.id,
            orderNumber: data.order_number,
            storeId: data.store_id,
            storeName: orderData.storeName,
            orderType: data.type, // order_type → type
            items: orderData.items, // 원본 데이터 사용 (Supabase에서 items가 제대로 저장되지 않을 수 있음)
            deliveryAddress: data.delivery_address ? JSON.parse(data.delivery_address) : undefined,
            paymentMethod: data.payment_method,
            paymentStatus: data.payment_status,
            subtotal: data.subtotal,
            taxAmount: data.tax_amount,
            deliveryFee: data.delivery_fee,
            totalAmount: data.total_amount,
            // 포인트 정보 추가
            pointsUsed: data.points_used || 0,
            pointsDiscountAmount: data.points_discount_amount || 0,
            status: data.status,
            createdAt: data.created_at,
            updatedAt: data.updated_at,
            completedAt: data.completed_at,
          };

          set((state) => ({
            orders: [newOrder, ...state.orders],
            isLoading: false
          }));

          console.log('🎉 주문 생성 완료 - 새로운 주문이 추가되었습니다:', newOrder.id);
          console.log('📊 현재 총 주문 수:', get().orders.length);

          // 주문 생성 후 즉시 주문 목록 새로고침 (실시간 동기화)
          setTimeout(() => {
            console.log('🔄 주문 목록 새로고침 시작...');
            get().fetchOrders();
          }, 1000);

          return newOrder;
        } catch (error) {
          console.error('❌ 주문 생성 실패:', error);
          console.error('❌ 오류 타입:', typeof error);
          console.error('❌ 오류 스택:', error instanceof Error ? error.stack : 'No stack trace');
          
          const errorMessage = error instanceof Error ? error.message : '주문 생성에 실패했습니다.';
          console.error('❌ 최종 에러 메시지:', errorMessage);
          
          set({ 
            error: errorMessage,
            isLoading: false 
          });
          throw error;
        }
      },

      updateOrderStatus: async (orderId, status) => {
        set({ isLoading: true, error: null });
        
        try {
          console.log(`🔄 주문 상태 업데이트: ${orderId} → ${status}`);

          const { data, error } = await supabase
            .from('orders')
            .update({ 
              status,
              updated_at: new Date().toISOString(),
              completed_at: status === 'completed' ? new Date().toISOString() : null
            })
            .eq('id', orderId)
            .select()
            .single();

          if (error) {
            console.error('❌ 주문 상태 업데이트 실패:', error);
            throw error;
          }

          console.log('✅ 주문 상태 업데이트 성공:', data);

          // 주문 상태 히스토리 추가
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            const { error: historyError } = await supabase
              .from('order_status_history')
              .insert({
                order_id: orderId,
                status: status,
                changed_by: user.id,
                notes: `주문 상태가 ${status}로 변경되었습니다.`
              });

            if (historyError) {
              console.error('❌ 주문 히스토리 저장 실패:', historyError);
              // 히스토리 저장 실패해도 주문 상태 업데이트는 계속 진행
            } else {
              console.log('✅ 주문 히스토리 저장 성공');
            }
          }

          // 주문 취소 시 원자적 재고 복구
          if (status === 'cancelled') {
            console.log('⚛️ 원자적 재고 복구 시작...');
            
            try {
              // 원자적 재고 복구 실행
              const restorationResult = await atomicInventoryRestoration(orderId, user.id);

              if (!restorationResult.success) {
                console.error('❌ 재고 복구 실패:', restorationResult.message);
                console.error('❌ 재고 복구 오류 목록:', restorationResult.errors);
                // 재고 복구 실패해도 주문 상태 업데이트는 계속 진행 (이미 취소됨)
              } else {
                console.log('✅ 원자적 재고 복구 성공:', {
                  transactionCount: restorationResult.transactionIds.length,
                  message: restorationResult.message
                });
              }

            } catch (restorationError) {
              console.error('❌ 재고 복구 중 예외 발생:', restorationError);
              // 재고 복구 실패해도 주문 상태 업데이트는 계속 진행
            }
          }

          // 로컬 상태 업데이트
          set((state) => ({
            orders: state.orders.map(order => 
              order.id === orderId 
                ? { 
                    ...order, 
                    status, 
                    updatedAt: data.updated_at,
                    completedAt: data.completed_at
                  }
                : order
            ),
            isLoading: false
          }));
        } catch (error) {
          console.error('❌ 주문 상태 업데이트 실패:', error);
          set({ 
            error: error instanceof Error ? error.message : '주문 상태 업데이트에 실패했습니다.',
            isLoading: false 
          });
          throw error;
        }
      },

      fetchOrders: async () => {
        set({ isLoading: true, error: null });
        
        try {
          console.log('📡 Supabase에서 주문 목록 조회 중...');

          // 현재 로그인한 사용자 정보 가져오기
          const { data: { user }, error: authError } = await supabase.auth.getUser();
          
          if (authError || !user) {
            console.error('❌ 사용자 인증 정보 없음:', authError);
            set({ orders: [], isLoading: false });
            return;
          }

          console.log('🔐 인증된 사용자:', user.id);

          // 사용자 프로필 정보 가져오기
          const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .single();

          if (profileError) {
            console.error('❌ 프로필 조회 실패:', profileError);
            set({ orders: [], isLoading: false });
            return;
          }

          console.log('👤 사용자 역할:', profile.role);

          let query = supabase
            .from('orders')
            .select(`
              *,
              stores (
                name
              ),
              order_items (
                product_id,
                product_name,
                quantity,
                unit_price,
                discount_amount,
                subtotal
              )
            `);

          // 점주인 경우 자신의 지점 주문만 조회
          if (profile.role === 'store_owner') {
            console.log('🏪 점주 - 자신의 지점 주문만 조회');
            
            // 점주의 지점 ID 가져오기
            const { data: storeData, error: storeError } = await supabase
              .from('stores')
              .select('id')
              .eq('owner_id', user.id)
              .maybeSingle();

            if (storeError) {
              console.error('❌ 점주의 지점 정보 조회 실패:', storeError);
              set({ orders: [], isLoading: false });
              return;
            }

            if (!storeData) {
              console.warn('⚠️ 점주 계정이지만 연결된 지점이 없습니다.');
              set({ orders: [], isLoading: false });
              return;
            }

            console.log('🏪 점주 지점 ID:', storeData.id);
            query = query.eq('store_id', storeData.id);
          } else if (profile.role === 'hq_admin' || profile.role === 'headquarters') {
            console.log('🏢 본사 관리자 - 모든 지점 주문 조회');
            // 본사는 모든 주문 조회 (필터링 없음)
          } else if (profile.role === 'customer') {
            console.log('👤 고객 - 자신의 주문만 조회');
            query = query.eq('customer_id', user.id);
          } else {
            console.log('👤 알 수 없는 역할 - 주문 조회 불가:', profile.role);
            set({ orders: [], isLoading: false });
            return;
          }

          const { data, error } = await query.order('created_at', { ascending: false });

          if (error) {
            console.error('❌ 주문 목록 조회 실패:', error);
            throw error;
          }

          console.log('✅ 주문 목록 조회 성공:', data?.length, '개');

          const orders: Order[] = (data || []).map(item => ({
            id: item.id,
            orderNumber: item.order_number,
            storeId: item.store_id,
            storeName: item.stores?.name || '알 수 없는 지점',
            orderType: item.type, // order_type → type
            items: (item.order_items || []).map((orderItem: any) => ({
              productId: orderItem.product_id,
              productName: orderItem.product_name,
              quantity: orderItem.quantity,
              price: orderItem.unit_price,
              discountRate: orderItem.discount_amount / (orderItem.unit_price * orderItem.quantity) || 0,
              subtotal: orderItem.subtotal
            })),
            deliveryAddress: item.delivery_address ? 
              (typeof item.delivery_address === 'string' ? 
                JSON.parse(item.delivery_address) : 
                item.delivery_address) : 
              undefined,
            paymentMethod: item.payment_method,
            paymentStatus: item.payment_status,
            subtotal: item.subtotal,
            taxAmount: item.tax_amount,
            deliveryFee: item.delivery_fee,
            totalAmount: item.total_amount,
            // 포인트 정보 추가
            pointsUsed: item.points_used || 0,
            pointsDiscountAmount: item.points_discount_amount || 0,
            // 쿠폰 정보 추가
            couponDiscountAmount: item.coupon_discount_amount || 0,
            appliedCouponId: item.applied_coupon_id,
            status: item.status,
            createdAt: item.created_at,
            updatedAt: item.updated_at,
            completedAt: item.completed_at,
          }));

          set({ orders, isLoading: false });
        } catch (error) {
          console.error('❌ 주문 목록 조회 실패:', error);
          set({ 
            error: error instanceof Error ? error.message : '주문 목록 조회에 실패했습니다.',
            isLoading: false 
          });
        }
      },

      subscribeToOrders: () => {
        console.log('🔔 주문 실시간 구독 시작...');
        
        if (orderSubscription) {
          orderSubscription.unsubscribe();
        }

        orderSubscription = supabase
          .channel('orders')
          .on('postgres_changes', 
            { 
              event: '*', 
              schema: 'public', 
              table: 'orders' 
            }, 
            (payload) => {
              console.log('🔄 주문 실시간 업데이트:', payload);
              
              // 주문 목록 새로고침
              get().fetchOrders();
            }
          )
          .subscribe();
      },

      unsubscribeFromOrders: () => {
        console.log('🔕 주문 실시간 구독 해제...');
        
        if (orderSubscription) {
          orderSubscription.unsubscribe();
          orderSubscription = null;
        }
      },

      getOrderById: (orderId) => {
        return get().orders.find(order => order.id === orderId);
      },

      getOrdersByStatus: (status) => {
        return get().orders.filter(order => order.status === status);
      },

      clearOrders: async () => {
        console.log('🚀 clearOrders 함수 시작');
        set({ isLoading: true, error: null });
        
        try {
          console.log('🗑️ 모든 주문 내역 삭제 시작...');

          // 현재 로그인한 사용자 ID 가져오기
          const { data: { user } } = await supabase.auth.getUser();
          
          if (!user) {
            throw new Error('로그인이 필요합니다.');
          }

          console.log('✅ 인증된 사용자:', user.id);

          // 주문 삭제 (CASCADE로 관련 데이터도 함께 삭제됨)
          const { error: deleteError } = await supabase
            .from('orders')
            .delete()
            .eq('customer_id', user.id);

          if (deleteError) {
            console.error('❌ 주문 삭제 실패:', deleteError);
            throw deleteError;
          }

          console.log('✅ 주문 삭제 완료');

          // localStorage에서 주문 데이터 제거 (persist 미들웨어 우회)
          const storageKey = 'convenience-store-orders';
          if (typeof window !== 'undefined') {
            localStorage.removeItem(storageKey);
            console.log('🗑️ localStorage에서 주문 데이터 제거 완료');
          }

          // 로컬 상태 초기화
          set({ orders: [], isLoading: false, error: null });
          
          // persist 미들웨어가 즉시 저장하도록 강제 실행 (여러 번 시도)
          const clearStorage = () => {
            if (typeof window !== 'undefined') {
              localStorage.removeItem(storageKey);
              console.log('🔄 persist 미들웨어 동기화 완료');
            }
          };
          
          // 즉시 실행
          clearStorage();
          
          // 약간의 지연 후 다시 실행 (persist 미들웨어가 다시 저장할 수 있으므로)
          setTimeout(clearStorage, 50);
          setTimeout(clearStorage, 200);
          
          console.log('✅ 모든 주문 내역 삭제 완료');
        } catch (error) {
          console.error('❌ 주문 내역 삭제 실패:', error);
          set({ 
            error: error instanceof Error ? error.message : '주문 내역 삭제에 실패했습니다.',
            isLoading: false 
          });
          throw error;
        }
      }
    }),
    {
      name: 'convenience-store-orders',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        // 주문이 비어있으면 아무것도 저장하지 않음 (삭제 시 localStorage에서 완전히 제거)
        ...(state.orders.length > 0 && { orders: state.orders })
      }),
      // persist 미들웨어가 상태 변경을 즉시 반영하도록 설정
      version: 1,
      migrate: (persistedState: any, version: number) => {
        // 버전 마이그레이션 로직 (필요시)
        return persistedState;
      }
    }
  )
);