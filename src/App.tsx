import { useState, useEffect, useRef } from 'react';
import {
  ClipboardList,
  Utensils,
  Clock,
  Check,
  CheckCircle,
  Hourglass,
  LogOut,
  Sparkles
} from 'lucide-react';
import {
  supabase,
  fetchRestaurantOrders,
  updateOrderStatus,
  updateOrderStaffStatus,
  markPendingOrderAsPaid,
  fetchMenuItems,
  fetchKitchenConfigurations,
  registerDeviceToken,
  type OrderLog
} from './services/supabase';
import { LoginScreen } from './components/LoginScreen';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { PushNotifications } from '@capacitor/push-notifications';


type TabType = 'new' | 'pending' | 'preparing' | 'completed';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(() => localStorage.getItem('staff_is_authenticated') === 'true');
  const [restaurantId, setRestaurantId] = useState(() => localStorage.getItem('staff_restaurant_id') || '');
  const [restaurantName, setRestaurantName] = useState(() => localStorage.getItem('staff_restaurant_name') || '');
  const [activeTab, setActiveTab] = useState<TabType>('new');
  const [orders, setOrders] = useState<OrderLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [visibleCounts, setVisibleCounts] = useState<Record<TabType, number>>({
    new: 10,
    pending: 10,
    preparing: 10,
    completed: 10
  });
  const [exitingCardIds, setExitingCardIds] = useState<Record<string, boolean>>({});
  const [dragState, setDragState] = useState<{ id: string; startX: number; currentX: number } | null>(null);
  const [menuItemsMap, setMenuItemsMap] = useState<Record<string, string>>({});
  const [kitchenConfigs, setKitchenConfigs] = useState<Record<string, boolean>>({});
  
  const successAudioRef = useRef<HTMLAudioElement | null>(null);

  const itemRequiresPrep = (itemName: string) => {
    const cat = (menuItemsMap[itemName.toLowerCase().trim()] || 'other').toLowerCase().trim();
    const requiresPrep = kitchenConfigs[cat];
    // Dynamic DB-only logic: Default to true unless explicitly configured as false in Supabase
    return requiresPrep !== false;
  };

  const isAutoCompletedOrder = (order: OrderLog) => {
    const items = order.edited_detected_items || order.detected_items || [];
    if (items.length === 0) return false;
    return items.every(item => !itemRequiresPrep(item.name));
  };

  const isNative = Capacitor.isNativePlatform();

  // Prevent screen from sleeping on native platform
  useEffect(() => {
    if (!isNative) return;
    import('@capacitor-community/keep-awake').then(({ KeepAwake }) => {
      KeepAwake.keepAwake().catch(err => {
        console.error("Failed to acquire KeepAwake lock:", err);
      });
    });
  }, [isNative]);

  // Request notification permission on native (Android 13+)
  useEffect(() => {
    if (!isNative) return;
    LocalNotifications.requestPermissions().catch(console.error);
  }, [isNative]);

  // Auto-play/pause success-audio.m4a loop based on presence of new orders and send notification
  useEffect(() => {
    if (!isAuthenticated) {
      if (successAudioRef.current) {
        successAudioRef.current.pause();
        successAudioRef.current = null;
      }
      if (isNative) LocalNotifications.cancelAll().catch(console.error);
      return;
    }

    const hasVisibleNewOrders = orders.some(order => {
      if (order.staff_status !== 'notified') return false;
      return !isAutoCompletedOrder(order);
    });

    if (hasVisibleNewOrders) {
      if (!successAudioRef.current) {
        const audio = new Audio('./audio/success-audio.m4a');
        audio.loop = true;
        audio.play().catch(e => console.error("Failed to play success-audio.m4a loop:", e));
        successAudioRef.current = audio;
      }
      // Fire native notification with ringtone & default vibration
      if (isNative) {
        LocalNotifications.schedule({
          notifications: [{
            title: '🍽️ New Order',
            body: 'A new order has arrived. Tap to view.',
            id: 9999,
            sound: 'new_order.m4a',
            smallIcon: 'ic_stat_name',
            schedule: { at: new Date(Date.now() + 100) },
          }]
        }).catch(console.error);
      }
    } else {
      if (successAudioRef.current) {
        successAudioRef.current.pause();
        successAudioRef.current.currentTime = 0;
        successAudioRef.current = null;
      }
      if (isNative) LocalNotifications.cancelAll().catch(console.error);
    }

    return () => {
      const stillHasVisible = orders.some(order => {
        if (order.staff_status !== 'notified') return false;
        return !isAutoCompletedOrder(order);
      });
      if (successAudioRef.current && !stillHasVisible) {
        successAudioRef.current.pause();
        successAudioRef.current = null;
        if (isNative) LocalNotifications.cancelAll().catch(console.error);
      }
    };
  }, [orders, isAuthenticated, menuItemsMap, kitchenConfigs, isNative]);

  // Check Auth
  useEffect(() => {
    const isAuth = localStorage.getItem('staff_is_authenticated') === 'true';
    if (isAuth) {
      setIsAuthenticated(true);
      setRestaurantId(localStorage.getItem('staff_restaurant_id') || '');
      setRestaurantName(localStorage.getItem('staff_restaurant_name') || '');
    }
  }, []);

  // Setup Push Notifications on Native Platform
  useEffect(() => {
    if (!isNative || !restaurantId) return;

    // Create a high-priority channel with custom sound so Android knows how to ring
    PushNotifications.createChannel({
      id: 'new_orders_channel',
      name: 'New Orders Channel',
      description: 'Incoming new orders alert channel',
      sound: 'new_order', // Refers to res/raw/new_order.m4a
      importance: 5, // IMPORTANCE_HIGH (vibrate and make sound)
      visibility: 1, // VISIBILITY_PUBLIC
      vibration: true,
    }).then(() => {
      console.log('Push notification channel created successfully');
    }).catch(err => {
      console.error('Failed to create push notification channel:', err);
    });

    // 1. Setup listeners FIRST before calling register()
    const addRegListener = PushNotifications.addListener('registration', token => {
      console.log('Push registration success, token: ' + token.value);
      registerDeviceToken(restaurantId, token.value).catch(err => {
        console.error('Error saving device token to database:', err);
      });
    });

    const addErrorListener = PushNotifications.addListener('registrationError', error => {
      console.error('Push registration error: ', error);
    });

    const addNotificationListener = PushNotifications.addListener('pushNotificationReceived', notification => {
      console.log('Push received in foreground: ', notification);
    });

    // 2. Request permissions and register
    PushNotifications.requestPermissions().then(result => {
      if (result.receive === 'granted') {
        PushNotifications.register().then(() => {
          console.log('FCM Registration requested');
        });
      }
    });

    return () => {
      addRegListener.then(h => h.remove?.());
      addErrorListener.then(h => h.remove?.());
      addNotificationListener.then(h => h.remove?.());
    };
  }, [isNative, restaurantId]);

  // Load Menu Items mapping for categories
  useEffect(() => {
    if (!restaurantId) return;

    fetchMenuItems(restaurantId)
      .then(items => {
        const mapping: Record<string, string> = {};
        items.forEach(item => {
          if (item.name) {
            const resolved = item.subcategory || item.category || 'other';
            mapping[item.name.toLowerCase().trim()] = resolved.toLowerCase().trim();
          }
        });
        setMenuItemsMap(mapping);
      })
      .catch(console.error);

    fetchKitchenConfigurations(restaurantId)
      .then(configs => {
        const mapping: Record<string, boolean> = {};
        configs.forEach(cfg => {
          if (cfg.category) {
            mapping[cfg.category.toLowerCase().trim()] = cfg.requires_preparation;
          }
        });
        setKitchenConfigs(mapping);
      })
      .catch(console.error);
  }, [restaurantId]);

  // Sync Theme variables to active tab
  useEffect(() => {
    const root = document.documentElement;
    if (activeTab === 'new') {
      // Orange Theme
      root.style.setProperty('--primary', '#9d4300');
      root.style.setProperty('--primary-container', '#f97316');
      root.style.setProperty('--on-primary', '#ffffff');
      root.style.setProperty('--background', '#f7f9fb');
      root.style.setProperty('--surface', '#f7f9fb');
      root.style.setProperty('--surface-container-low', '#f2f4f6');
      root.style.setProperty('--surface-container', '#eceef0');
      root.style.setProperty('--surface-container-high', '#e6e8ea');
      root.style.setProperty('--surface-container-highest', '#e0e3e5');
      root.style.setProperty('--surface-container-lowest', '#ffffff');
      root.style.setProperty('--on-surface', '#191c1e');
      root.style.setProperty('--on-surface-variant', '#584237');
      root.style.setProperty('--outline-variant', '#e0c0b1');
      root.style.setProperty('--outline', '#8c7164');
      root.style.setProperty('--secondary', '#515f74');
      root.style.setProperty('--secondary-container', '#d5e3fc');
      root.style.setProperty('--on-secondary-container', '#57657a');
      root.style.setProperty('--tertiary', '#006591');
      root.style.setProperty('--tertiary-container', '#09a4e8');
      root.style.setProperty('--on-tertiary-container', '#003650');
      root.style.setProperty('--error', '#ba1a1a');
      root.style.setProperty('--error-container', '#ffdad6');
      root.style.setProperty('--on-error-container', '#93000a');
    } else if (activeTab === 'pending' || activeTab === 'preparing') {
      // Purple Theme
      root.style.setProperty('--primary', '#630ed4');
      root.style.setProperty('--primary-container', '#8b5cf6');
      root.style.setProperty('--on-primary', '#ffffff');
      root.style.setProperty('--background', '#f9f9ff');
      root.style.setProperty('--surface', '#f8f9ff');
      root.style.setProperty('--surface-container-low', '#f0f3ff');
      root.style.setProperty('--surface-container', '#e7eeff');
      root.style.setProperty('--surface-container-high', '#dee8ff');
      root.style.setProperty('--surface-container-highest', '#d8e3fb');
      root.style.setProperty('--surface-container-lowest', '#ffffff');
      root.style.setProperty('--on-surface', '#111c2d');
      root.style.setProperty('--on-surface-variant', '#4a4455');
      root.style.setProperty('--outline-variant', '#ccc3d8');
      root.style.setProperty('--outline', '#cbd5e1');
      root.style.setProperty('--secondary', '#6950a2');
      root.style.setProperty('--secondary-container', '#c0a5fe');
      root.style.setProperty('--on-secondary-container', '#4f3687');
      root.style.setProperty('--tertiary', '#4e4e58');
      root.style.setProperty('--tertiary-container', '#666670');
      root.style.setProperty('--on-tertiary-container', '#e7e5f1');
      root.style.setProperty('--error', '#ef4444');
      root.style.setProperty('--error-container', '#ffdad6');
      root.style.setProperty('--on-error-container', '#93000a');
    } else if (activeTab === 'completed') {
      // Green Theme
      root.style.setProperty('--primary', '#006c49');
      root.style.setProperty('--primary-container', '#10b981');
      root.style.setProperty('--on-primary', '#ffffff');
      root.style.setProperty('--background', '#f8f9ff');
      root.style.setProperty('--surface', '#f8f9ff');
      root.style.setProperty('--surface-container-low', '#eff4ff');
      root.style.setProperty('--surface-container', '#e6eeff');
      root.style.setProperty('--surface-container-high', '#dee9fc');
      root.style.setProperty('--surface-container-highest', '#d9e3f6');
      root.style.setProperty('--surface-container-lowest', '#ffffff');
      root.style.setProperty('--on-surface', '#121c2a');
      root.style.setProperty('--on-surface-variant', '#3c4a42');
      root.style.setProperty('--outline-variant', '#bbcabf');
      root.style.setProperty('--outline', '#6c7a71');
      root.style.setProperty('--secondary', '#2b6954');
      root.style.setProperty('--secondary-container', '#adedd3');
      root.style.setProperty('--on-secondary-container', '#306d58');
      root.style.setProperty('--tertiary', '#55615a');
      root.style.setProperty('--tertiary-container', '#99a69e');
      root.style.setProperty('--on-tertiary-container', '#303c36');
      root.style.setProperty('--primary-fixed-dim', '#4edea3');
      root.style.setProperty('--error', '#ba1a1a');
      root.style.setProperty('--error-container', '#ffdad6');
      root.style.setProperty('--on-error-container', '#93000a');
    }
  }, [activeTab]);

  // Fetch & Subscribe Realtime
  useEffect(() => {
    if (!restaurantId) return;

    setLoading(true);
    fetchRestaurantOrders(restaurantId)
      .then(setOrders)
      .catch(console.error)
      .finally(() => setLoading(false));

    // 1. Realtime subscription (instant if enabled in Supabase)
    const channel = supabase
      .channel('scans_logs_all_changes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'scans_logs',
        filter: `restaurant_id=eq.${restaurantId}`
      }, (payload) => {
        console.log("Realtime change detected in scans_logs:", payload);
        fetchRestaurantOrders(restaurantId).then(setOrders).catch(console.error);
      })
      .subscribe((status) => {
        console.log("Supabase scans_logs subscription status:", status);
      });

    // 2. Polling Fallback (auto-updates every 4 seconds if realtime replication is disabled)
    const pollingInterval = setInterval(() => {
      fetchRestaurantOrders(restaurantId)
        .then(setOrders)
        .catch(console.error);
    }, 4000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(pollingInterval);
    };
  }, [restaurantId, activeTab]);

  const handleLoginSuccess = (id: string, name: string) => {
    setRestaurantId(id);
    setRestaurantName(name);
    setIsAuthenticated(true);
  };

  const handleLogout = () => {
    localStorage.clear();
    setIsAuthenticated(false);
    setRestaurantId('');
    setRestaurantName('');
    setOrders([]);
  };

  const playBoom = () => {
    const audio = new Audio('/audio/Vine boom sound effect.mp3');
    audio.play().catch(e => console.error("Audio failed:", e));
  };

  const animateAndTransition = (orderId: string, actionFn: () => Promise<void>) => {
    playBoom();
    setExitingCardIds(prev => ({ ...prev, [orderId]: true }));
    setTimeout(async () => {
      await actionFn();
      setExitingCardIds(prev => {
        const next = { ...prev };
        delete next[orderId];
        return next;
      });
    }, 300);
  };

  const handleStaffStatusChange = (orderId: string, nextStaffStatus: string) => {
    animateAndTransition(orderId, async () => {
      try {
        await updateOrderStaffStatus(orderId, nextStaffStatus);
        const updated = await fetchRestaurantOrders(restaurantId);
        setOrders(updated);
      } catch (e) {
        console.error("Failed to update staff status:", e);
      }
    });
  };

  const handlePaymentStatusChange = (orderId: string, nextPaymentStatus: string) => {
    animateAndTransition(orderId, async () => {
      try {
        await updateOrderStatus(orderId, nextPaymentStatus);
        const updated = await fetchRestaurantOrders(restaurantId);
        setOrders(updated);
      } catch (e) {
        console.error("Failed to update payment status:", e);
      }
    });
  };

  const handleMarkPendingPaid = (orderId: string) => {
    animateAndTransition(orderId, async () => {
      try {
        await markPendingOrderAsPaid(orderId);
        const updated = await fetchRestaurantOrders(restaurantId);
        setOrders(updated);
      } catch (e) {
        console.error("Failed to mark pending order as paid:", e);
      }
    });
  };

  const handlePointerDown = (e: React.PointerEvent, orderId: string) => {
    if (e.button !== 0) return; // Only trigger on left-click/primary touch
    
    // Ignore drags if target is inside a button or link to let normal clicks work
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('a')) {
      return;
    }

    setDragState({
      id: orderId,
      startX: e.clientX,
      currentX: e.clientX
    });
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragState) return;
    setDragState(prev => prev ? { ...prev, currentX: e.clientX } : null);
  };

  const handlePointerUp = (
    e: React.PointerEvent, 
    orderId: string, 
    type: 'staff' | 'payment', 
    nextStatus: string
  ) => {
    if (!dragState || dragState.id !== orderId) return;
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    
    const deltaX = dragState.currentX - dragState.startX;
    setDragState(null);

    if (deltaX > 100) {
      if (activeTab === 'pending') {
        handleMarkPendingPaid(orderId);
      } else if (type === 'staff') {
        handleStaffStatusChange(orderId, nextStatus);
      } else {
        handlePaymentStatusChange(orderId, nextStatus);
      }
    }
  };

  const getFilteredOrders = () => {
    return orders.filter(order => {
      const payStatus = order.payment_status?.toLowerCase();
      const staffStatus = order.staff_status;
      
      if (activeTab === 'new') {
        if (staffStatus !== 'notified') return false;
        
        // Filter out orders that contain ONLY items that do not require preparation
        return !isAutoCompletedOrder(order);
      }
      if (activeTab === 'pending') return payStatus === 'pending';
      if (activeTab === 'preparing') return staffStatus === 'preparing';
      if (activeTab === 'completed') {
        const isReady = staffStatus === 'ready';
        const isAutoPaid = payStatus === 'completed' && staffStatus === 'notified' && isAutoCompletedOrder(order);
        return isReady || isAutoPaid;
      }
      return false;
    });
  };

  const formatTime = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  const formatRelativeTime = (isoString: string) => {
    try {
      const d = new Date(isoString);
      const diffMs = Date.now() - d.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      if (diffMins < 1) return 'just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      const diffHrs = Math.floor(diffMins / 60);
      return `${diffHrs}h ago`;
    } catch {
      return '';
    }
  };

  const groupItems = (items: { name: string; price: number }[]) => {
    return items.reduce((acc: any[], item) => {
      const existing = acc.find(i => i.name === item.name);
      if (existing) {
        existing.quantity += 1;
      } else {
        acc.push({ ...item, quantity: 1 });
      }
      return acc;
    }, []);
  };

  if (!isAuthenticated) {
    return <LoginScreen onLoginSuccess={handleLoginSuccess} />;
  }

  const filteredOrders = getFilteredOrders();

  return (
    <div className="w-full min-h-screen bg-background text-on-background flex flex-col font-body antialiased max-w-md mx-auto relative shadow-2xl">
      {/* Header Info */}
      <header className="bg-surface-container-lowest border-b border-outline-variant px-4 py-3 shrink-0 flex justify-between items-center z-10">
        <div>
          <h2 className="text-base font-bold text-primary flex items-center gap-1.5">
            <Utensils size={18} />
            {restaurantName}
          </h2>
          <p className="text-xs text-on-surface-variant"></p>
        </div>
        <button
          onClick={handleLogout}
          className="p-2 text-on-surface-variant hover:text-red-600 rounded-lg hover:bg-surface-container-low transition-colors"
          title="Logout"
        >
          <LogOut size={18} />
        </button>
      </header>

      {/* Tabs Navigation */}
      <nav className="bg-surface-container-lowest sticky top-0 z-40 border-b border-outline-variant overflow-x-auto hide-scroll px-4 shrink-0">
        <ul className="flex whitespace-nowrap min-w-min justify-between gap-6">
          <li className="py-3">
            <button
              onClick={() => setActiveTab('new')}
              className={`pb-1 text-sm font-semibold flex items-center gap-1 transition-all ${activeTab === 'new'
                  ? 'text-primary border-b-2 border-primary'
                  : 'text-on-surface-variant border-b-2 border-transparent'
                }`}
            >
              <Sparkles size={16} />
              New
            </button>
          </li>
          <li className="py-3">
            <button
              onClick={() => setActiveTab('pending')}
              className={`pb-1 text-sm font-semibold flex items-center gap-1 transition-all ${activeTab === 'pending'
                  ? 'text-primary border-b-2 border-primary'
                  : 'text-on-surface-variant border-b-2 border-transparent'
                }`}
            >
              <Hourglass size={16} />
              Tgh order...
            </button>
          </li>
          <li className="py-3">
            <button
              onClick={() => setActiveTab('preparing')}
              className={`pb-1 text-sm font-semibold flex items-center gap-1 transition-all ${activeTab === 'preparing'
                  ? 'text-primary border-b-2 border-primary'
                  : 'text-on-surface-variant border-b-2 border-transparent'
                }`}
            >
              <Clock size={16} />
              Preparing
            </button>
          </li>
          <li className="py-3">
            <button
              onClick={() => setActiveTab('completed')}
              className={`pb-1 text-sm font-semibold flex items-center gap-1 transition-all ${activeTab === 'completed'
                  ? 'text-primary border-b-2 border-primary'
                  : 'text-on-surface-variant border-b-2 border-transparent'
                }`}
            >
              <CheckCircle size={16} />
              Completed
            </button>
          </li>
        </ul>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 w-full pt-4 pb-20 px-4 flex flex-col overflow-y-auto">
        <div className="flex justify-between items-end mb-4 shrink-0">
          <h1 className="text-xl font-bold tracking-tight text-primary">
            {activeTab === 'new' && 'New Orders'}
            {activeTab === 'pending' && 'Pending Payment'}
            {activeTab === 'preparing' && 'Preparing'}
            {activeTab === 'completed' && 'Completed History'}
          </h1>
          <span className="text-xs text-on-surface-variant font-medium uppercase tracking-wider">
            {filteredOrders.length} {filteredOrders.length === 1 ? 'Order' : 'Orders'}
          </span>
        </div>

        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center py-20 text-on-surface-variant gap-2">
            <div className="w-8 h-8 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
            <span className="text-xs font-semibold">Updating Hub...</span>
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center py-20 text-on-surface-variant border border-dashed border-outline-variant/60 rounded-xl bg-surface-container-low/30">
            <ClipboardList size={48} className="opacity-30 mb-3 text-primary" />
            <span className="text-sm font-bold">No orders found</span>
            <span className="text-xs">Incoming kiosk orders appear here.</span>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {filteredOrders.slice(0, visibleCounts[activeTab]).map(order => {
              const rawItems = order.edited_detected_items || order.detected_items || [];
              
              // Filter out items that do not require preparation on the New Orders tab
              const items = activeTab === 'new'
                ? rawItems.filter(item => itemRequiresPrep(item.name))
                : rawItems;

              const grouped = groupItems(items);

              const isCompletedTab = activeTab === 'completed';
              const actionType = activeTab === 'pending' ? 'payment' : 'staff';
              const nextStatus = activeTab === 'new' ? 'preparing' : (activeTab === 'pending' ? 'completed' : 'ready');
              const isDraggingThisCard = dragState?.id === order.id;
              const dragOffset = isDraggingThisCard ? Math.max(0, dragState.currentX - dragState.startX) : 0;

              const pointerHandlers = !isCompletedTab ? {
                onPointerDown: (e: React.PointerEvent) => handlePointerDown(e, order.id),
                onPointerMove: handlePointerMove,
                onPointerUp: (e: React.PointerEvent) => handlePointerUp(e, order.id, actionType, nextStatus)
              } : {};

              return (
                <article
                  key={order.id}
                  className={`bg-surface-container-lowest border border-outline-variant rounded-xl p-4 flex flex-col gap-3 relative overflow-hidden hover:border-primary transition-all shadow-sm ${
                    exitingCardIds[order.id] ? 'animate-swipe-out' : 'animate-zoom-in'
                  }`}
                  style={{
                    transform: dragOffset > 0 ? `translateX(${dragOffset}px)` : undefined,
                    touchAction: !isCompletedTab ? 'pan-y' : undefined,
                    cursor: !isCompletedTab ? 'grab' : undefined
                  }}
                  {...pointerHandlers}
                >
                  {/* Left indicator bar */}
                  <div className="absolute top-0 left-0 w-1.5 h-full bg-primary" />

                  {/* Header info */}
                  <header className="flex justify-between items-start pl-2">
                    <div>
                      {activeTab !== 'new' && (
                        <h3 className="text-lg font-bold text-on-surface leading-none mb-1">
                          #{order.order_ref || order.id.substring(0, 6)}
                        </h3>
                      )}
                      <p className="text-xs text-on-surface-variant flex items-center gap-1">
                        <Clock size={12} />
                        {formatTime(order.created_at)}
                      </p>
                    </div>

                    {activeTab === 'new' && (
                      <div className="bg-orange-500/15 text-orange-600 px-2.5 py-1 rounded-full flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider">
                        <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse"></span>
                        New
                      </div>
                    )}
                  </header>

                  {/* Chips for table restaurant & dining option */}
                  <div className="pl-2 flex gap-2 flex-wrap">
                    {order.table_number && (
                      <span className="bg-surface-container-high text-on-surface-variant text-xs leading-tight font-semibold px-2.5 py-1 rounded-lg border border-outline-variant/30 flex items-center gap-1">
                        <span className="material-symbols-outlined text-[7px] leading-none">table_restaurant</span>
                        Table {order.table_number}
                      </span>
                    )}
                    <span className="bg-primary-container/10 text-primary text-xs leading-tight font-bold px-2.5 py-1 rounded-lg border border-primary-container/30 capitalize">
                      {order.makan_mana === 'makan_sini' ? 'Makan Sini' : 'Bungkus'}
                    </span>
                  </div>

                  {/* Items list */}
                  <div className="pl-2 space-y-1.5 flex-1 text-sm text-on-surface mt-1">
                    <div className="bg-surface-container-low border border-outline-variant/30 rounded-xl p-3 shadow-sm space-y-2">
                      <p className="font-semibold text-on-surface-variant text-xs uppercase tracking-wide border-b border-outline-variant/20 pb-1 mb-1.5">
                        Selected Meal Items
                      </p>
                      <ul className="space-y-1.5">
                        {grouped.map((item, idx) => (
                          <li key={idx} className="flex items-start gap-2.5 text-on-surface text-[13px]">
                            <span className="font-bold text-primary w-5 shrink-0 text-right">
                              {item.quantity}x
                            </span>
                            <span className="flex-1">{item.name}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  {/* Order Footer with actions */}
                  <footer className="mt-2 pt-2 border-t border-outline-variant/20 pl-2">
                    {activeTab === 'new' && (
                      <button
                        onClick={() => handleStaffStatusChange(order.id, 'preparing')}
                        className="w-full bg-primary hover:opacity-90 active:scale-[0.98] text-white font-semibold text-xs py-2.5 rounded-xl transition-all uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-sm"
                      >
                        Accept Order
                        <Check size={14} />
                      </button>
                    )}
                    {activeTab === 'pending' && (
                      <button
                        onClick={() => handleMarkPendingPaid(order.id)}
                        className="w-full bg-primary hover:opacity-90 active:scale-[0.98] text-white font-semibold text-xs py-2.5 rounded-xl transition-all uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-sm"
                      >
                        Mark as Paid
                        <Check size={14} />
                      </button>
                    )}
                    {activeTab === 'preparing' && (
                      <button
                        onClick={() => handleStaffStatusChange(order.id, 'ready')}
                        className="w-full bg-primary hover:opacity-90 active:scale-[0.98] text-white font-semibold text-xs py-2.5 rounded-xl transition-all uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-sm"
                      >
                        Complete Preparation
                        <Check size={14} />
                      </button>
                    )}
                    {activeTab === 'completed' && (
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-on-surface-variant font-medium">Counter Staff</span>
                        <span className="text-primary font-bold">
                          {formatRelativeTime(order.created_at)}
                        </span>
                      </div>
                    )}
                  </footer>
                </article>
              );
            })}

            {filteredOrders.length > visibleCounts[activeTab] && (
              <button
                onClick={() => setVisibleCounts(prev => ({ ...prev, [activeTab]: prev[activeTab] + 10 }))}
                className="w-full py-3 mt-2 bg-surface-container border border-outline-variant hover:bg-surface-container-high active:scale-[0.99] text-primary font-bold text-sm rounded-xl transition-all uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-sm"
              >
                See more orders
              </button>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
