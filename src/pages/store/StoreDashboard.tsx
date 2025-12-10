import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOrderStore } from '../../stores/orderStore';
import { useAuthStore } from '../../stores/common/authStore';
import { supabase } from '../../lib/supabase/client';

interface DashboardStats {
  todaySales: number;
  todayOrders: number;
  pendingOrders: number;
  lowStockItems: number;
  weeklyGrowth: number;
  monthlyGrowth: number;
}

interface SalesData {
  date: string;
  sales: number;
  orders: number;
}

interface StoreProduct {
  id: string;
  product_id: string;
  stock_quantity: number;
  safety_stock: number;
  product: {
    name: string;
  };
}

const StoreDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { orders, fetchOrders, subscribeToOrders, unsubscribeFromOrders } = useOrderStore();
  const { user } = useAuthStore();
  const [storeName, setStoreName] = useState<string>('');
  const [storeId, setStoreId] = useState<string>('');
  const [storeProducts, setStoreProducts] = useState<StoreProduct[]>([]);
  const [loading, setLoading] = useState(true);

  // 타임아웃 설정 (10초 후 자동으로 로딩 해제)
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (loading) {
        console.log('⏰ 대시보드 로딩 타임아웃 - 강제 해제');
        setLoading(false);
      }
    }, 10000);

    return () => clearTimeout(timeout);
  }, [loading]);

  // 점주의 지점 정보 가져오기
  useEffect(() => {
    const fetchStoreInfo = async () => {
      if (!user?.id) return;

      try {
        const { data, error } = await supabase
          .from('stores')
          .select('id, name')
          .eq('owner_id', user.id)
          .maybeSingle();

        if (error) {
          console.error('❌ 지점 정보 조회 실패:', error);
          setLoading(false);
          return;
        }

        if (data) {
          console.log('🏪 지점 정보 조회 성공:', data.name);
          setStoreName(data.name);
          setStoreId(data.id);
        } else {
          console.warn('⚠️ 연결된 지점이 없습니다. 지점을 먼저 생성해주세요.');
          setLoading(false);
        }
      } catch (error) {
        console.error('❌ 지점 정보 조회 중 오류:', error);
        // 에러가 발생해도 로딩 상태는 해제
        setLoading(false);
      }
    };

    fetchStoreInfo();
  }, [user?.id]);

  // 재고 데이터 조회
  const fetchStoreProducts = async () => {
    if (!storeId) return;

    try {
      const { data, error } = await supabase
        .from('store_products')
        .select(`
          id,
          product_id,
          stock_quantity,
          safety_stock,
          product:products(name)
        `)
        .eq('store_id', storeId);

      if (error) {
        console.error('❌ 재고 데이터 조회 실패:', error);
        return;
      }

      // null 값 처리 및 타입 변환
      const validatedData = (data || []).map((item: any) => ({
        id: item.id,
        product_id: item.product_id || '',
        stock_quantity: item.stock_quantity || 0,
        safety_stock: item.safety_stock || 10,
        product: {
          name: item.product?.name || '알 수 없는 상품'
        }
      })) as StoreProduct[];

      setStoreProducts(validatedData);
    } catch (error) {
      console.error('❌ 재고 데이터 조회 중 오류:', error);
    }
  };

  // 재고 데이터 실시간 구독
  useEffect(() => {
    if (!storeId) return;

    fetchStoreProducts();

    const channel = supabase
      .channel('store_products_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'store_products',
          filter: `store_id=eq.${storeId}`
        },
        () => {
          console.log('🔄 재고 데이터 변경 감지');
          fetchStoreProducts();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [storeId]);

  useEffect(() => {
    // 컴포넌트 마운트 시 주문 목록 조회 및 실시간 구독
    fetchOrders();
    subscribeToOrders();

    // 컴포넌트 언마운트 시 구독 해제
    return () => {
      unsubscribeFromOrders();
    };
  }, [fetchOrders, subscribeToOrders, unsubscribeFromOrders]);

  const [stats, setStats] = useState<DashboardStats>({
    todaySales: 0,
    todayOrders: 0,
    pendingOrders: 0,
    lowStockItems: 0,
    weeklyGrowth: 0,
    monthlyGrowth: 0
  });

  // 통계 데이터 계산 (메모이제이션)
  const calculatedStats = useMemo(() => {
    // 기본 통계 데이터 설정 (데이터가 없어도 기본값으로 설정)
    const today = new Date().toDateString();
    const todayOrders = orders.filter(order => 
      new Date(order.createdAt).toDateString() === today
    );
    
    const todaySales = todayOrders.reduce((sum, order) => sum + order.totalAmount, 0);
    const pendingOrders = orders.filter(order => 
      ['pending', 'confirmed', 'preparing'].includes(order.status)
    ).length;

    // 재고 부족 아이템 계산
    const lowStockItems = storeProducts.filter(product => 
      product.stock_quantity <= product.safety_stock
    ).length;

    // 주간 성장률 계산 (이번 주 vs 지난 주)
    const now = new Date();
    const thisWeekStart = new Date(now);
    thisWeekStart.setDate(now.getDate() - now.getDay());
    thisWeekStart.setHours(0, 0, 0, 0);

    const lastWeekStart = new Date(thisWeekStart);
    lastWeekStart.setDate(thisWeekStart.getDate() - 7);

    const thisWeekOrders = orders.filter(order => 
      new Date(order.createdAt) >= thisWeekStart
    );
    const lastWeekOrders = orders.filter(order => {
      const orderDate = new Date(order.createdAt);
      return orderDate >= lastWeekStart && orderDate < thisWeekStart;
    });

    const thisWeekSales = thisWeekOrders.reduce((sum, order) => sum + order.totalAmount, 0);
    const lastWeekSales = lastWeekOrders.reduce((sum, order) => sum + order.totalAmount, 0);

    const weeklyGrowth = lastWeekSales > 0 
      ? ((thisWeekSales - lastWeekSales) / lastWeekSales) * 100 
      : 0;

    // 월간 성장률 계산 (이번 달 vs 지난 달)
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const thisMonthOrders = orders.filter(order => 
      new Date(order.createdAt) >= thisMonthStart
    );
    const lastMonthOrders = orders.filter(order => {
      const orderDate = new Date(order.createdAt);
      return orderDate >= lastMonthStart && orderDate < thisMonthStart;
    });

    const thisMonthSales = thisMonthOrders.reduce((sum, order) => sum + order.totalAmount, 0);
    const lastMonthSales = lastMonthOrders.reduce((sum, order) => sum + order.totalAmount, 0);

    const monthlyGrowth = lastMonthSales > 0 
      ? ((thisMonthSales - lastMonthSales) / lastMonthSales) * 100 
      : 0;

    return {
      todaySales,
      todayOrders: todayOrders.length,
      pendingOrders,
      lowStockItems,
      weeklyGrowth: Math.round(weeklyGrowth * 10) / 10, // 소수점 첫째 자리까지
      monthlyGrowth: Math.round(monthlyGrowth * 10) / 10
    };
  }, [orders, storeProducts]);

  // 최근 주문 (메모이제이션)
  const recentOrders = useMemo(() => orders.slice(0, 5), [orders]);

  // 매출 데이터 (메모이제이션)
  const salesData = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toDateString();
      
      const dayOrders = orders.filter(order => 
        new Date(order.createdAt).toDateString() === dateStr
      );
      
      return {
        date: date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' }),
        sales: dayOrders.reduce((sum, order) => sum + order.totalAmount, 0),
        orders: dayOrders.length
      };
    }).reverse();
  }, [orders]);

  // 스탯 업데이트 및 로딩 상태 관리
  useEffect(() => {
    setStats(calculatedStats);
    
    // 로딩 상태 해제 - 지점 정보가 로드되었으면 대시보드 표시
    if (storeName) {
      setLoading(false);
    }
  }, [calculatedStats, storeName]);

  const getStatusBadge = (status: string) => {
    const badges = {
      pending: 'bg-yellow-100 text-yellow-800',
      confirmed: 'bg-blue-100 text-blue-800',
      preparing: 'bg-orange-100 text-orange-800',
      ready: 'bg-purple-100 text-purple-800',
      completed: 'bg-green-100 text-green-800',
      cancelled: 'bg-red-100 text-red-800'
    };
    
    const texts = {
      pending: '접수',
      confirmed: '확인',
      preparing: '준비중',
      ready: '완료대기',
      completed: '완료',
      cancelled: '취소'
    };

    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${badges[status as keyof typeof badges]}`}>
        {texts[status as keyof typeof texts]}
      </span>
    );
  };

  const maxSales = useMemo(() => Math.max(...salesData.map(d => d.sales)), [salesData]);

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">대시보드 데이터를 불러오는 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* 헤더 */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">점주 대시보드</h1>
          <p className="text-gray-600 mt-1">{storeName ? `${storeName} 운영 현황` : '지점 운영 현황'}</p>
        </div>
        <div className="text-sm text-gray-500">
          마지막 업데이트: {new Date().toLocaleTimeString('ko-KR')}
        </div>
      </div>

      {/* 주요 지표 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">오늘 매출</p>
              <p className="text-2xl font-bold text-gray-900">
                {stats.todaySales.toLocaleString()}원
              </p>
            </div>
            <div className="p-3 bg-blue-50 rounded-full">
              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
              </svg>
            </div>
          </div>
          <div className="mt-4">
            <span className={`text-sm font-medium ${stats.weeklyGrowth >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {stats.weeklyGrowth >= 0 ? '+' : ''}{stats.weeklyGrowth}%
            </span>
            <span className="text-sm text-gray-500 ml-2">지난 주 대비</span>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">오늘 주문</p>
              <p className="text-2xl font-bold text-gray-900">{stats.todayOrders}건</p>
            </div>
            <div className="p-3 bg-green-50 rounded-full">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
              </svg>
            </div>
          </div>
          <div className="mt-4">
            <span className={`text-sm font-medium ${stats.monthlyGrowth >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {stats.monthlyGrowth >= 0 ? '+' : ''}{stats.monthlyGrowth}%
            </span>
            <span className="text-sm text-gray-500 ml-2">지난 달 대비</span>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">처리 대기</p>
              <p className="text-2xl font-bold text-gray-900">{stats.pendingOrders}건</p>
            </div>
            <div className="p-3 bg-orange-50 rounded-full">
              <svg className="w-6 h-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
          <div className="mt-4">
            <span className="text-sm text-orange-600 font-medium">즉시 처리 필요</span>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">재고 부족</p>
              <p className="text-2xl font-bold text-gray-900">{stats.lowStockItems}개</p>
            </div>
            <div className="p-3 bg-red-50 rounded-full">
              <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
          </div>
          <div className="mt-4">
            <span className="text-sm text-red-600 font-medium">발주 검토 필요</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 매출 차트 */}
        <div className="lg:col-span-2 bg-white rounded-lg shadow-sm p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-lg font-semibold text-gray-900">최근 7일 매출</h2>
            <div className="flex space-x-2">
              <span className="text-sm text-gray-500">단위: 원</span>
            </div>
          </div>
          
          <div className="space-y-4">
            {salesData.map((data, index) => (
              <div key={index} className="flex items-center space-x-4">
                <div className="w-12 text-sm text-gray-600">{data.date}</div>
                <div className="flex-1">
                  <div className="flex items-center space-x-2">
                    <div 
                      className="bg-blue-500 h-6 rounded"
                      style={{ 
                        width: `${maxSales > 0 ? (data.sales / maxSales) * 100 : 0}%`,
                        minWidth: data.sales > 0 ? '20px' : '0px'
                      }}
                    />
                    <span className="text-sm font-medium text-gray-900">
                      {data.sales.toLocaleString()}원
                    </span>
                    <span className="text-sm text-gray-500">
                      ({data.orders}건)
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 최근 주문 */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-lg font-semibold text-gray-900">최근 주문</h2>
            <button className="text-sm text-blue-600 hover:text-blue-800">
              전체 보기
            </button>
          </div>
          
          <div className="space-y-4">
            {recentOrders.length === 0 ? (
              <div className="text-center py-8">
                <svg className="w-12 h-12 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                <p className="text-gray-500 text-sm">아직 주문이 없습니다</p>
              </div>
            ) : (
              recentOrders.map((order) => (
                <div key={order.id} className="border-b border-gray-100 pb-4 last:border-b-0">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <p className="font-medium text-sm text-gray-900">
                        {order.orderNumber}
                      </p>
                      <p className="text-xs text-gray-500">
                        {new Date(order.createdAt).toLocaleString('ko-KR')}
                      </p>
                    </div>
                    {getStatusBadge(order.status)}
                  </div>
                  <div className="flex justify-between items-center">
                    <div className="text-sm text-gray-600">
                      {order.orderType === 'pickup' ? '픽업' : '배송'} • {order.items.length}개 상품
                    </div>
                    <div className="font-medium text-sm text-gray-900">
                      {order.totalAmount.toLocaleString()}원
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* 빠른 액션 */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">빠른 액션</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <button 
            onClick={() => navigate('/store/orders')}
            className="flex flex-col items-center p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <svg className="w-8 h-8 text-blue-600 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <span className="text-sm font-medium text-gray-900">주문 관리</span>
            {stats.pendingOrders > 0 && (
              <span className="mt-1 px-2 py-1 bg-red-100 text-red-600 text-xs rounded-full">
                {stats.pendingOrders}건 대기
              </span>
            )}
          </button>
          
          <button 
            onClick={() => navigate('/store/inventory')}
            className="flex flex-col items-center p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <svg className="w-8 h-8 text-green-600 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
            <span className="text-sm font-medium text-gray-900">재고 관리</span>
            {stats.lowStockItems > 0 && (
              <span className="mt-1 px-2 py-1 bg-orange-100 text-orange-600 text-xs rounded-full">
                {stats.lowStockItems}개 부족
              </span>
            )}
          </button>
          
          <button 
            onClick={() => navigate('/store/supply')}
            className="flex flex-col items-center p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <svg className="w-8 h-8 text-orange-600 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3a2 2 0 012-2h4a2 2 0 012 2v4m-6 4h6m-6 0V7m6 4v10a2 2 0 01-2 2H10a2 2 0 01-2-2V11z" />
            </svg>
            <span className="text-sm font-medium text-gray-900">발주 요청</span>
          </button>
          
          <button 
            onClick={() => navigate('/store/analytics')}
            className="flex flex-col items-center p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <svg className="w-8 h-8 text-purple-600 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2h-2a2 2 0 00-2-2z" />
            </svg>
            <span className="text-sm font-medium text-gray-900">매출 분석</span>
          </button>

          <button 
            onClick={() => navigate('/store/inventory-analytics')}
            className="flex flex-col items-center p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <svg className="w-8 h-8 text-indigo-600 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
            <span className="text-sm font-medium text-gray-900">재고 분석</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default StoreDashboard; 