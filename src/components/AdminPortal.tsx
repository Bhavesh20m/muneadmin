import React, { useState, useEffect, useRef } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  updateDoc,
  setDoc,
  deleteDoc,
  query,
  orderBy
} from 'firebase/firestore';
import {
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged,
  User
} from 'firebase/auth';
import { db, auth, handleFirestoreError, OperationType } from '../firebase';
import { MenuItem, Order, OrderStatus, ServiceRequest, Category } from '../types';
import { formatINR, getStatusDetails } from '../utils/pure_logic';
import { VegNonVegIndicator } from './VegNonVegIndicator';
import { SpiceIndicator } from './SpiceIndicator';
import { TableQrModal } from './TableQrModal';
import {
  ClipboardList,
  Utensils,
  Bell,
  CheckCircle2,
  Clock,
  Check,
  X,
  Volume2,
  VolumeX,
  LogOut,
  Lock,
  Plus,
  Edit2,
  Trash2,
  ExternalLink,
  QrCode,
  Flame,
  Search,
  Filter,
  AlertCircle,
  Eye,
  EyeOff,
  ChefHat,
  Smartphone
} from 'lucide-react';

interface Props {
  onNavigateToCustomer?: (tableId?: string) => void;
}

export const AdminPortal: React.FC<Props> = ({ onNavigateToCustomer }) => {
  // Authentication state
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isDemoStaffLoggedIn, setIsDemoStaffLoggedIn] = useState<boolean>(() => {
    return sessionStorage.getItem('dineflow_staff_auth') === 'true';
  });
  const [pinInput, setPinInput] = useState('');
  const [loginError, setLoginError] = useState('');

  // Active navigation tab
  const [activeTab, setActiveTab] = useState<'orders' | 'menu'>('orders');

  // Orders State
  const [orders, setOrders] = useState<Order[]>([]);
  const [orderFilter, setOrderFilter] = useState<string>('all');
  const [orderSearch, setOrderSearch] = useState('');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const prevOrderCountRef = useRef<number>(0);
  const [newOrderAlert, setNewOrderAlert] = useState<Order | null>(null);

  // Service Requests State
  const [serviceRequests, setServiceRequests] = useState<ServiceRequest[]>([]);

  // Menu State
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [menuSearch, setMenuSearch] = useState('');

  // QR Modal
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);

  // Audio chime
  const playChime = () => {
    if (!soundEnabled) return;
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
      osc.frequency.setValueAtTime(880, audioCtx.currentTime + 0.12); // A5
      gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.5);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.5);
    } catch {
      // AudioContext could be blocked by browser policy until interaction
    }
  };

  // Auth state listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
    });
    return () => unsubscribe();
  }, []);

  const isAuthenticated = !!currentUser || isDemoStaffLoggedIn;

  // Real-time Orders Listener (when authenticated)
  useEffect(() => {
    if (!isAuthenticated) return;

    const ordersCol = collection(db, 'orders');
    const unsubscribe = onSnapshot(
      ordersCol,
      (snapshot) => {
        const loadedOrders: Order[] = [];
        snapshot.forEach((docSnap) => {
          loadedOrders.push({ id: docSnap.id, ...docSnap.data() } as Order);
        });

        // Sort descending by created time
        loadedOrders.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

        // Check if a new order arrived
        if (prevOrderCountRef.current > 0 && loadedOrders.length > prevOrderCountRef.current) {
          const newest = loadedOrders[0];
          if (newest && newest.status === 'received') {
            playChime();
            setNewOrderAlert(newest);
            setTimeout(() => setNewOrderAlert(null), 6000);
          }
        }
        prevOrderCountRef.current = loadedOrders.length;
        setOrders(loadedOrders);
      },
      (error) => {
        console.error('Error fetching orders:', error);
      }
    );

    return () => unsubscribe();
  }, [isAuthenticated, soundEnabled]);

  // Real-time Service Requests Listener
  useEffect(() => {
    if (!isAuthenticated) return;

    const reqCol = collection(db, 'serviceRequests');
    const unsubscribe = onSnapshot(
      reqCol,
      (snapshot) => {
        const loaded: ServiceRequest[] = [];
        snapshot.forEach((docSnap) => {
          loaded.push({ id: docSnap.id, ...docSnap.data() } as ServiceRequest);
        });
        loaded.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        setServiceRequests(loaded);
      },
      (error) => {
        console.error('Error fetching service requests:', error);
      }
    );

    return () => unsubscribe();
  }, [isAuthenticated]);

  // Real-time Menu Items Listener
  useEffect(() => {
    if (!isAuthenticated) return;

    const menuCol = collection(db, 'menuItems');
    const unsubscribe = onSnapshot(
      menuCol,
      (snapshot) => {
        const loaded: MenuItem[] = [];
        snapshot.forEach((docSnap) => {
          loaded.push({ id: docSnap.id, ...docSnap.data() } as MenuItem);
        });
        setMenuItems(loaded);
      },
      (error) => {
        console.error('Error fetching menu items:', error);
      }
    );

    return () => unsubscribe();
  }, [isAuthenticated]);

  // Handle Staff Login
  const handlePinLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (pinInput === '2468' || pinInput.toLowerCase() === 'admin') {
      setIsDemoStaffLoggedIn(true);
      sessionStorage.setItem('dineflow_staff_auth', 'true');
      setLoginError('');
      setPinInput('');
    } else {
      setLoginError('Invalid Passcode. Enter demo passcode: 2468');
    }
  };

  const handleGoogleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      setLoginError('');
    } catch (err: any) {
      console.error('Google login error:', err);
      setLoginError(err.message || 'Login failed');
    }
  };

  const handleLogout = async () => {
    setIsDemoStaffLoggedIn(false);
    sessionStorage.removeItem('dineflow_staff_auth');
    try {
      await signOut(auth);
    } catch (e) {
      // ignore
    }
  };

  // Order Status update
  const handleUpdateOrderStatus = async (orderId: string, newStatus: OrderStatus) => {
    try {
      const orderRef = doc(db, 'orders', orderId);
      await updateDoc(orderRef, {
        status: newStatus,
        updatedAt: Date.now(),
      });
    } catch (error) {
      console.error('Failed to update order status:', error);
      alert('Could not update order status.');
    }
  };

  // Resolve Service Request
  const handleResolveServiceRequest = async (requestId: string) => {
    try {
      const reqRef = doc(db, 'serviceRequests', requestId);
      await updateDoc(reqRef, {
        status: 'resolved',
      });
    } catch (err) {
      console.error('Failed to resolve request:', err);
    }
  };

  // Menu Management Handlers
  const handleToggleAvailability = async (item: MenuItem) => {
    try {
      const itemRef = doc(db, 'menuItems', item.id);
      await updateDoc(itemRef, {
        isAvailable: !item.isAvailable,
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error('Error toggling availability:', err);
    }
  };

  const handleTogglePublished = async (item: MenuItem) => {
    try {
      const itemRef = doc(db, 'menuItems', item.id);
      await updateDoc(itemRef, {
        isPublished: !item.isPublished,
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error('Error toggling publish state:', err);
    }
  };

  const handleDeleteMenuItem = async (itemId: string) => {
    if (!confirm('Are you sure you want to delete this dish from the menu?')) return;
    try {
      await deleteDoc(doc(db, 'menuItems', itemId));
    } catch (err) {
      console.error('Error deleting menu item:', err);
    }
  };

  const handleSaveMenuItem = async (data: Partial<MenuItem>) => {
    try {
      if (editingItem) {
        const itemRef = doc(db, 'menuItems', editingItem.id);
        await updateDoc(itemRef, {
          ...data,
          updatedAt: new Date().toISOString(),
        });
        setEditingItem(null);
      } else {
        const menuCol = collection(db, 'menuItems');
        const newDoc = doc(menuCol);
        await setDoc(newDoc, {
          ...data,
          id: newDoc.id,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        setIsAddModalOpen(false);
      }
    } catch (err) {
      console.error('Error saving menu item:', err);
      alert('Could not save menu item.');
    }
  };

  // Filtered orders
  const filteredOrders = orders.filter((order) => {
    if (orderFilter !== 'all' && order.status !== orderFilter) {
      return false;
    }
    if (orderSearch.trim()) {
      const q = orderSearch.toLowerCase();
      const matchNum = order.orderNumber.toLowerCase().includes(q);
      const matchTable = `table ${order.tableId}`.toLowerCase().includes(q);
      const matchName = (order.customerName || '').toLowerCase().includes(q);
      return matchNum || matchTable || matchName;
    }
    return true;
  });

  // Filtered menu in admin
  const filteredMenuItems = menuItems.filter((item) => {
    if (!menuSearch.trim()) return true;
    const q = menuSearch.toLowerCase();
    return (
      item.name.toLowerCase().includes(q) ||
      item.category.toLowerCase().includes(q) ||
      item.description.toLowerCase().includes(q)
    );
  });

  // Pending service requests count
  const pendingRequests = serviceRequests.filter((r) => r.status === 'pending');

  // If not authenticated, show protected staff login screen
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 border border-gray-200">
          <div className="text-center mb-6">
            <div className="w-12 h-12 rounded-xl bg-slate-900 text-white flex items-center justify-center font-bold text-xl mx-auto shadow-md">
              DF
            </div>
            <h2 className="text-xl font-bold text-slate-900 mt-3">DineFlow Staff Portal</h2>
            <p className="text-xs text-slate-500 mt-1">
              Restricted access for restaurant administration and kitchen orders
            </p>
          </div>

          {loginError && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
              <span>{loginError}</span>
            </div>
          )}

          <form onSubmit={handlePinLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5 uppercase tracking-wider">
                Staff Demo Passcode
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="password"
                  value={pinInput}
                  onChange={(e) => setPinInput(e.target.value)}
                  placeholder="Enter 2468 or 'admin'"
                  className="w-full pl-9 pr-4 py-2.5 bg-gray-50 border border-gray-300 rounded-lg text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-slate-900 font-mono tracking-widest"
                  autoFocus
                />
              </div>
              <p className="text-[11px] text-slate-500 mt-1.5">
                Quick testing demo passcode: <span className="font-bold text-slate-800">2468</span>
              </p>
            </div>

            <button
              type="submit"
              className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-sm rounded-lg transition-colors shadow-xs"
            >
              Enter Staff Orders Portal
            </button>
          </form>

          <div className="my-5 relative flex items-center justify-center">
            <div className="border-t border-gray-200 w-full" />
            <span className="bg-white px-3 text-[11px] uppercase font-semibold text-slate-400 absolute">
              or sign in with
            </span>
          </div>

          <button
            type="button"
            onClick={handleGoogleLogin}
            className="w-full py-2.5 bg-white border border-gray-300 hover:bg-gray-50 text-slate-700 font-medium text-xs rounded-lg transition-colors flex items-center justify-center gap-2 shadow-2xs"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            <span>Google Account</span>
          </button>

          {/* Quick link back to customer menu table 5 */}
          <div className="mt-6 pt-4 border-t border-gray-100 text-center">
            <button
              type="button"
              onClick={() => onNavigateToCustomer?.('5')}
              className="text-xs text-slate-500 hover:text-slate-800 font-medium inline-flex items-center gap-1"
            >
              <span>Switch to Customer View (Table 5)</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 text-slate-900 flex flex-col">
      {/* Top Staff Navigation Header */}
      <header className="sticky top-0 z-40 bg-slate-900 text-white border-b border-slate-800 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-amber-500 text-slate-950 font-bold flex items-center justify-center text-sm shadow-xs">
                DF
              </div>
              <div>
                <h1 className="text-sm font-bold tracking-tight text-white flex items-center gap-2">
                  <span>DineFlow Staff Portal</span>
                  <span className="text-[10px] font-normal px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                    Staff Live
                  </span>
                </h1>
                <p className="text-[11px] text-slate-400">Order Management & Menu Control</p>
              </div>
            </div>

            {/* Navigation Tabs */}
            <nav className="hidden sm:flex items-center gap-1 ml-6 border-l border-slate-800 pl-4">
              <button
                type="button"
                onClick={() => setActiveTab('orders')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 ${
                  activeTab === 'orders'
                    ? 'bg-white text-slate-900'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
              >
                <ClipboardList className="w-3.5 h-3.5" />
                <span>Orders Dashboard</span>
                {orders.filter((o) => o.status === 'received').length > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full bg-amber-500 text-slate-950 text-[10px] font-bold">
                    {orders.filter((o) => o.status === 'received').length}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('menu')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 ${
                  activeTab === 'menu'
                    ? 'bg-white text-slate-900'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
              >
                <Utensils className="w-3.5 h-3.5" />
                <span>Basic Menu Management</span>
              </button>
            </nav>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {/* Table QR & NFC preview trigger */}
            <button
              type="button"
              onClick={() => setIsQrModalOpen(true)}
              className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium flex items-center gap-1.5 transition-colors"
              title="Table QR Codes & NFC Link"
            >
              <QrCode className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden md:inline">Table QR / NFC</span>
            </button>

            {/* Sound chime toggle */}
            <button
              type="button"
              onClick={() => setSoundEnabled(!soundEnabled)}
              className={`p-2 rounded-lg border text-xs font-medium transition-colors ${
                soundEnabled
                  ? 'bg-slate-800 text-slate-200 border-slate-700 hover:bg-slate-700'
                  : 'bg-red-950/60 text-red-300 border-red-900 hover:bg-red-900/80'
              }`}
              title={soundEnabled ? 'Mute new order chime' : 'Enable new order chime'}
            >
              {soundEnabled ? <Volume2 className="w-4 h-4 text-emerald-400" /> : <VolumeX className="w-4 h-4" />}
            </button>

            {/* Open customer view in separate action */}
            <button
              type="button"
              onClick={() => onNavigateToCustomer?.('5')}
              className="hidden lg:flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium transition-colors"
              title="Preview Customer Portal for Table 5"
            >
              <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
              <span>Customer Table 5</span>
            </button>

            {/* Logout */}
            <button
              type="button"
              onClick={handleLogout}
              className="p-2 rounded-lg bg-slate-800 hover:bg-red-900/70 text-slate-300 hover:text-white border border-slate-700 transition-colors"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Mobile Navigation Tabs */}
        <div className="flex sm:hidden border-t border-slate-800 bg-slate-950 px-4 py-1.5 gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('orders')}
            className={`flex-1 py-1.5 text-xs font-semibold rounded text-center ${
              activeTab === 'orders' ? 'bg-slate-800 text-white' : 'text-slate-400'
            }`}
          >
            Orders ({orders.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('menu')}
            className={`flex-1 py-1.5 text-xs font-semibold rounded text-center ${
              activeTab === 'menu' ? 'bg-slate-800 text-white' : 'text-slate-400'
            }`}
          >
            Menu ({menuItems.length})
          </button>
        </div>
      </header>

      {/* New Order Banner Toast */}
      {newOrderAlert && (
        <div className="bg-amber-400 text-slate-950 px-4 py-2 text-xs font-bold flex items-center justify-between border-b border-amber-500 shadow-md animate-in slide-in-from-top duration-200">
          <div className="flex items-center gap-2 max-w-7xl mx-auto w-full">
            <Bell className="w-4 h-4 animate-bounce" />
            <span>
              🔔 NEW ORDER: {newOrderAlert.orderNumber} from Table {newOrderAlert.tableId} •{' '}
              {formatINR(newOrderAlert.totalAmount)}
            </span>
          </div>
          <button onClick={() => setNewOrderAlert(null)} className="p-1 hover:opacity-75">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Pending Waiter Calls Notice Bar */}
      {pendingRequests.length > 0 && (
        <div className="bg-white border-b border-amber-200 px-4 py-2.5">
          <div className="max-w-7xl mx-auto flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-ping" />
              <span className="text-xs font-bold text-slate-900">
                Active Table Requests ({pendingRequests.length}):
              </span>
              <div className="flex items-center gap-2 flex-wrap">
                {pendingRequests.map((req) => (
                  <span
                    key={req.id}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 border border-amber-200 rounded-md text-xs font-semibold text-amber-900"
                  >
                    <span>Table {req.tableId}:</span>
                    <span className="capitalize">{req.type.replace('_', ' ')}</span>
                    <button
                      type="button"
                      onClick={() => handleResolveServiceRequest(req.id)}
                      className="ml-1 px-1.5 py-0.5 bg-amber-200 hover:bg-amber-300 text-amber-950 rounded text-[10px] font-bold"
                    >
                      Resolve
                    </button>
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 flex-1 w-full space-y-6">
        {activeTab === 'orders' ? (
          /* =========================================================================
             ORDERS DASHBOARD
             ========================================================================= */
          <div className="space-y-5">
            {/* Control Bar: Filters & Search */}
            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
              {/* Status Filter Tabs */}
              <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0 no-scrollbar">
                {[
                  { id: 'all', label: 'All Orders' },
                  { id: 'received', label: 'New Orders' },
                  { id: 'accepted', label: 'Accepted' },
                  { id: 'preparing', label: 'Preparing' },
                  { id: 'ready', label: 'Ready' },
                  { id: 'completed', label: 'Completed' },
                ].map((f) => {
                  const count =
                    f.id === 'all'
                      ? orders.length
                      : orders.filter((o) => o.status === f.id).length;
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setOrderFilter(f.id)}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-lg whitespace-nowrap transition-colors border ${
                        orderFilter === f.id
                          ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                          : 'bg-white text-slate-600 border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      <span>{f.label}</span>
                      <span className="ml-1.5 text-[10px] opacity-75">({count})</span>
                    </button>
                  );
                })}
              </div>

              {/* Search Orders */}
              <div className="relative min-w-[240px]">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search by order #, table, name..."
                  value={orderSearch}
                  onChange={(e) => setOrderSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-slate-900"
                />
                {orderSearch && (
                  <button
                    onClick={() => setOrderSearch('')}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Orders Grid */}
            {filteredOrders.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
                <ChefHat className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                <h3 className="text-sm font-bold text-slate-800">No Orders Found</h3>
                <p className="text-xs text-slate-500 mt-1">
                  {orderFilter !== 'all'
                    ? `No orders matching filter "${orderFilter}".`
                    : 'Customer orders placed from dining tables will arrive here in real time.'}
                </p>
                <div className="mt-4">
                  <button
                    type="button"
                    onClick={() => onNavigateToCustomer?.('5')}
                    className="px-3.5 py-2 bg-slate-900 text-white rounded-lg text-xs font-semibold hover:bg-slate-800 transition-colors"
                  >
                    Place a test order from Table 5
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredOrders.map((order) => {
                  const statusInfo = getStatusDetails(order.status);
                  const orderDate = new Date(order.createdAt);
                  const timeFormatted = orderDate.toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  });

                  return (
                    <div
                      key={order.id}
                      className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-2xs hover:shadow-xs transition-shadow flex flex-col justify-between"
                    >
                      {/* Order Card Header */}
                      <div className="p-4 border-b border-gray-100 bg-gray-50/50 flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-extrabold text-sm text-slate-900">
                              {order.orderNumber}
                            </span>
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-slate-900 text-white">
                              Table {order.tableId}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 mt-1 flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-slate-400" />
                            <span>{timeFormatted}</span>
                            {order.customerName && (
                              <>
                                <span>•</span>
                                <span className="font-medium text-slate-700 truncate max-w-[120px]">
                                  {order.customerName}
                                </span>
                              </>
                            )}
                          </p>
                        </div>

                        {/* Status Badge */}
                        <span
                          className={`text-xs font-bold px-2.5 py-1 rounded-full border ${statusInfo.colorClass}`}
                        >
                          {statusInfo.label}
                        </span>
                      </div>

                      {/* Items List */}
                      <div className="p-4 flex-1 space-y-2 text-xs">
                        <div className="space-y-1.5 divide-y divide-gray-100">
                          {order.items.map((item, idx) => (
                            <div key={idx} className="pt-1.5 first:pt-0">
                              <div className="flex items-center justify-between">
                                <span className="font-semibold text-slate-800">
                                  <span className="text-slate-900 font-bold mr-1">
                                    {item.quantity}×
                                  </span>{' '}
                                  {item.name}
                                </span>
                                <span className="text-slate-600 font-medium">
                                  {formatINR(item.price * item.quantity)}
                                </span>
                              </div>
                              {item.specialInstructions && (
                                <p className="text-[11px] text-amber-800 italic mt-0.5">
                                  Note: {item.specialInstructions}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>

                        {/* Order-level special instruction */}
                        {order.specialInstructions && (
                          <div className="mt-3 p-2 bg-amber-50 border border-amber-200 rounded text-[11px] text-amber-900">
                            <strong>Kitchen Instructions:</strong> {order.specialInstructions}
                          </div>
                        )}
                      </div>

                      {/* Order Footer & Actions */}
                      <div className="p-4 border-t border-gray-100 bg-gray-50/50 space-y-3">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-500 font-medium">
                            Payment: <span className="uppercase font-bold text-slate-700">{order.paymentMethod}</span> ({order.paymentStatus})
                          </span>
                          <span className="font-extrabold text-sm text-slate-900">
                            {formatINR(order.totalAmount)}
                          </span>
                        </div>

                        {/* State Action Buttons */}
                        <div className="grid grid-cols-2 gap-2">
                          {order.status === 'received' && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleUpdateOrderStatus(order.id, 'accepted')}
                                className="py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold transition-colors shadow-xs"
                              >
                                Accept Order
                              </button>
                              <button
                                type="button"
                                onClick={() => handleUpdateOrderStatus(order.id, 'rejected')}
                                className="py-2 bg-white border border-red-200 hover:bg-red-50 text-red-700 rounded-lg text-xs font-bold transition-colors"
                              >
                                Reject
                              </button>
                            </>
                          )}

                          {order.status === 'accepted' && (
                            <button
                              type="button"
                              onClick={() => handleUpdateOrderStatus(order.id, 'preparing')}
                              className="col-span-2 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold transition-colors shadow-xs"
                            >
                              Mark Preparing
                            </button>
                          )}

                          {order.status === 'preparing' && (
                            <button
                              type="button"
                              onClick={() => handleUpdateOrderStatus(order.id, 'ready')}
                              className="col-span-2 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-colors shadow-xs"
                            >
                              Mark Ready
                            </button>
                          )}

                          {order.status === 'ready' && (
                            <button
                              type="button"
                              onClick={() => handleUpdateOrderStatus(order.id, 'completed')}
                              className="col-span-2 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold transition-colors shadow-xs"
                            >
                              Mark Completed
                            </button>
                          )}

                          {order.status === 'completed' && (
                            <div className="col-span-2 text-center py-1.5 text-xs font-semibold text-slate-500 bg-gray-100 rounded-lg">
                              Order Completed
                            </div>
                          )}

                          {order.status === 'rejected' && (
                            <div className="col-span-2 text-center py-1.5 text-xs font-semibold text-red-600 bg-red-50 rounded-lg">
                              Order Rejected
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          /* =========================================================================
             BASIC MENU MANAGEMENT
             ========================================================================= */
          <div className="space-y-5">
            {/* Header & Add Button */}
            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-bold text-slate-900">Restaurant Menu Catalog</h2>
                <p className="text-xs text-slate-500">
                  Manage dishes, pricing, availability, and published status in real-time.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <div className="relative min-w-[200px]">
                  <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search menu catalog..."
                    value={menuSearch}
                    onChange={(e) => setMenuSearch(e.target.value)}
                    className="w-full pl-9 pr-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs text-slate-900"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(true)}
                  className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors shadow-xs"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Dish</span>
                </button>
              </div>
            </div>

            {/* Menu Items Table */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-2xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-600">
                  <thead className="bg-gray-50 border-b border-gray-200 text-[11px] uppercase tracking-wider text-slate-700 font-semibold">
                    <tr>
                      <th className="px-4 py-3">Dish / Photo</th>
                      <th className="px-4 py-3">Category</th>
                      <th className="px-4 py-3">Price</th>
                      <th className="px-4 py-3">Diet & Spice</th>
                      <th className="px-4 py-3 text-center">Available</th>
                      <th className="px-4 py-3 text-center">Published</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredMenuItems.map((item) => (
                      <tr key={item.id} className="hover:bg-gray-50/70 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <img
                              src={item.imageUrl}
                              alt={item.name}
                              className="w-11 h-11 rounded-lg object-cover bg-gray-100 border border-gray-200 flex-shrink-0"
                            />
                            <div>
                              <div className="font-bold text-slate-900">{item.name}</div>
                              <p className="text-[11px] text-slate-500 line-clamp-1 max-w-xs">
                                {item.description}
                              </p>
                            </div>
                          </div>
                        </td>

                        <td className="px-4 py-3 font-medium text-slate-700">
                          {item.category}
                        </td>

                        <td className="px-4 py-3 font-bold text-slate-900">
                          {formatINR(item.price)}
                        </td>

                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <VegNonVegIndicator isVeg={item.isVeg} size="sm" />
                            <SpiceIndicator level={item.spiceLevel} />
                          </div>
                        </td>

                        {/* Availability Toggle */}
                        <td className="px-4 py-3 text-center">
                          <button
                            type="button"
                            onClick={() => handleToggleAvailability(item)}
                            className={`px-2.5 py-1 rounded-md text-[11px] font-bold border transition-colors ${
                              item.isAvailable
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                : 'bg-gray-100 text-gray-500 border-gray-300'
                            }`}
                          >
                            {item.isAvailable ? 'In Stock' : 'Out of Stock'}
                          </button>
                        </td>

                        {/* Published Toggle */}
                        <td className="px-4 py-3 text-center">
                          <button
                            type="button"
                            onClick={() => handleTogglePublished(item)}
                            className={`px-2.5 py-1 rounded-md text-[11px] font-bold border transition-colors ${
                              item.isPublished
                                ? 'bg-blue-50 text-blue-800 border-blue-200'
                                : 'bg-amber-50 text-amber-800 border-amber-200'
                            }`}
                          >
                            {item.isPublished ? 'Published' : 'Draft'}
                          </button>
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => setEditingItem(item)}
                              className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-gray-100 rounded-md transition-colors"
                              title="Edit dish"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteMenuItem(item.id)}
                              className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-md transition-colors"
                              title="Delete dish"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Add / Edit Menu Item Modal */}
      {(isAddModalOpen || editingItem) && (
        <MenuEditorModal
          initialItem={editingItem}
          onClose={() => {
            setIsAddModalOpen(false);
            setEditingItem(null);
          }}
          onSave={handleSaveMenuItem}
        />
      )}

      {/* Table QR & NFC Destinations Modal */}
      <TableQrModal
        isOpen={isQrModalOpen}
        onClose={() => setIsQrModalOpen(false)}
        onNavigateToTable={(tId) => onNavigateToCustomer?.(tId)}
      />
    </div>
  );
};

/* =========================================================================
   MENU ITEM ADD / EDIT MODAL COMPONENT
   ========================================================================= */
interface MenuEditorModalProps {
  initialItem: MenuItem | null;
  onClose: () => void;
  onSave: (data: Partial<MenuItem>) => void;
}

const MenuEditorModal: React.FC<MenuEditorModalProps> = ({ initialItem, onClose, onSave }) => {
  const [name, setName] = useState(initialItem?.name || '');
  const [description, setDescription] = useState(initialItem?.description || '');
  const [price, setPrice] = useState(initialItem?.price ? String(initialItem.price) : '250');
  const [category, setCategory] = useState<string>(initialItem?.category || 'Main Course');
  const [imageUrl, setImageUrl] = useState(
    initialItem?.imageUrl ||
      'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=800&auto=format&fit=crop&q=80'
  );
  const [isVeg, setIsVeg] = useState(initialItem ? initialItem.isVeg : true);
  const [spiceLevel, setSpiceLevel] = useState(initialItem ? initialItem.spiceLevel : 1);
  const [isAvailable, setIsAvailable] = useState(initialItem ? initialItem.isAvailable : true);
  const [isPublished, setIsPublished] = useState(initialItem ? initialItem.isPublished : true);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return alert('Dish name is required');
    const numericPrice = Number(price);
    if (isNaN(numericPrice) || numericPrice <= 0) return alert('Valid price is required');

    onSave({
      name: name.trim(),
      description: description.trim(),
      price: numericPrice,
      category,
      imageUrl: imageUrl.trim(),
      isVeg,
      spiceLevel,
      isAvailable,
      isPublished,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full border border-gray-200 overflow-hidden animate-in zoom-in-95 duration-150">
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
          <h3 className="font-bold text-sm">
            {initialItem ? 'Edit Dish Details' : 'Add New Dish to Menu'}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto text-xs">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Dish Name</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Paneer Butter Masala"
              className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-slate-900"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Description</label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Flavor notes, ingredients, cooking style..."
              className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-slate-900"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Price (INR ₹)</label>
              <input
                type="number"
                required
                min="1"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-slate-900 font-semibold"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-slate-900 font-medium"
              >
                <option value="Starters">Starters</option>
                <option value="Main Course">Main Course</option>
                <option value="Breads & Rice">Breads & Rice</option>
                <option value="Desserts">Desserts</option>
                <option value="Beverages">Beverages</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Food Image URL</label>
            <input
              type="url"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://images.unsplash.com/..."
              className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-slate-900 font-mono text-[11px]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3 pt-1">
            <div>
              <label className="block font-semibold text-slate-700 mb-1.5">Dietary Type</label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsVeg(true)}
                  className={`flex-1 py-1.5 px-2 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 ${
                    isVeg ? 'bg-emerald-50 border-emerald-500 text-emerald-800' : 'bg-gray-50 text-gray-600'
                  }`}
                >
                  <VegNonVegIndicator isVeg={true} size="sm" />
                  <span>Veg</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsVeg(false)}
                  className={`flex-1 py-1.5 px-2 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 ${
                    !isVeg ? 'bg-red-50 border-red-500 text-red-800' : 'bg-gray-50 text-gray-600'
                  }`}
                >
                  <VegNonVegIndicator isVeg={false} size="sm" />
                  <span>Non-Veg</span>
                </button>
              </div>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1.5">Spice Level</label>
              <select
                value={spiceLevel}
                onChange={(e) => setSpiceLevel(Number(e.target.value))}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg text-slate-900 font-medium"
              >
                <option value={0}>0 - None</option>
                <option value={1}>1 - Mild</option>
                <option value={2}>2 - Medium</option>
                <option value={3}>3 - Spicy</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-gray-200">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isAvailable}
                onChange={(e) => setIsAvailable(e.target.checked)}
                className="w-4 h-4 rounded text-slate-900"
              />
              <span className="font-semibold text-slate-800">Available (In Stock)</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isPublished}
                onChange={(e) => setIsPublished(e.target.checked)}
                className="w-4 h-4 rounded text-slate-900"
              />
              <span className="font-semibold text-slate-800">Published to Customers</span>
            </label>
          </div>

          <div className="pt-4 border-t border-gray-200 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 text-slate-700 font-semibold rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-lg shadow-xs"
            >
              Save Dish
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
