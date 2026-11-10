import React, { useState, useEffect, useMemo } from 'react';
import {
  collection,
  doc,
  setDoc,
  onSnapshot,
  getDocs,
  writeBatch,
  query,
  where
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { MenuItem, CartItem, Order, OrderStatus, PaymentMethod, ServiceRequestType } from '../types';
import { INITIAL_MENU_ITEMS } from '../data/seedMenu';
import {
  calculateCartTotal,
  calculateTotalItems,
  formatINR,
  generateOrderNumber,
  getStatusDetails,
  filterDishes
} from '../utils/pure_logic';
import { VegNonVegIndicator } from './VegNonVegIndicator';
import { SpiceIndicator } from './SpiceIndicator';
import {
  Search,
  ShoppingBag,
  Bell,
  Plus,
  Minus,
  X,
  CheckCircle2,
  Clock,
  UtensilsCrossed,
  GlassWater,
  FileText,
  HelpCircle,
  CreditCard,
  QrCode,
  Banknote,
  Sparkles,
  ChevronRight,
  AlertCircle
} from 'lucide-react';

interface Props {
  tableId: string;
  onNavigateToAdmin?: () => void;
}

export const CustomerPortal: React.FC<Props> = ({ tableId, onNavigateToAdmin }) => {
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [loadingMenu, setLoadingMenu] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [vegOnly, setVegOnly] = useState(false);

  // Cart state
  const [cart, setCart] = useState<CartItem[]>(() => {
    try {
      const saved = localStorage.getItem(`dineflow_cart_${tableId}`);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [isCartOpen, setIsCartOpen] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [orderInstructions, setOrderInstructions] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('upi');
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);

  // Active / Tracked Orders for this table session
  const [activeOrderIds, setActiveOrderIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(`dineflow_orders_${tableId}`);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [trackedOrders, setTrackedOrders] = useState<Order[]>([]);
  const [activeTrackingOrder, setActiveTrackingOrder] = useState<Order | null>(null);

  // Waiter Call Modal & Toast
  const [isWaiterModalOpen, setIsWaiterModalOpen] = useState(false);
  const [waiterRequestSent, setWaiterRequestSent] = useState<string | null>(null);
  const [isSendingRequest, setIsSendingRequest] = useState(false);

  // Item customization modal
  const [customizingItem, setCustomizingItem] = useState<MenuItem | null>(null);
  const [customInstructions, setCustomInstructions] = useState('');

  // Persist cart to localStorage
  useEffect(() => {
    localStorage.setItem(`dineflow_cart_${tableId}`, JSON.stringify(cart));
  }, [cart, tableId]);

  // Persist active orders
  useEffect(() => {
    localStorage.setItem(`dineflow_orders_${tableId}`, JSON.stringify(activeOrderIds));
  }, [activeOrderIds, tableId]);

  // Load Menu from Firestore
  useEffect(() => {
    const q = query(collection(db, 'menuItems'), where('isPublished', '==', true));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const items: MenuItem[] = [];
        snapshot.forEach((docSnap) => {
          items.push({ id: docSnap.id, ...docSnap.data() } as MenuItem);
        });
        setMenuItems(items);
        setLoadingMenu(false);
      },
      (error) => {
        console.error('Error fetching menu items:', error);
        setLoadingMenu(false);
      }
    );

    return () => unsubscribe();
  }, []);

  // Listen in real-time to active orders placed by this customer
  useEffect(() => {
    if (activeOrderIds.length === 0) {
      setTrackedOrders([]);
      setActiveTrackingOrder(null);
      return;
    }

    const unsubscribers = activeOrderIds.map((orderId) => {
      const orderDocRef = doc(db, 'orders', orderId);
      return onSnapshot(
        orderDocRef,
        (snap) => {
          if (snap.exists()) {
            const orderData = { id: snap.id, ...snap.data() } as Order;
            setTrackedOrders((prev) => {
              const updated = prev.filter((o) => o.id !== orderId);
              return [orderData, ...updated];
            });

            // Update modal state if open
            setActiveTrackingOrder((current) => (current?.id === orderId ? orderData : current));
          }
        },
        (error) => {
          console.error(`Error listening to order ${orderId}:`, error);
        }
      );
    });

    return () => {
      unsubscribers.forEach((unsub) => unsub());
    };
  }, [activeOrderIds]);

  // Categories list
  const categories = useMemo(() => {
    const set = new Set<string>(['All']);
    menuItems.forEach((item) => {
      if (item.category) set.add(item.category);
    });
    return Array.from(set);
  }, [menuItems]);

  // Filtered menu
  const visibleDishes = useMemo(() => {
    return filterDishes(menuItems, searchQuery, selectedCategory, vegOnly, true);
  }, [menuItems, searchQuery, selectedCategory, vegOnly]);

  // Cart operations
  const handleAddToCart = (dish: MenuItem, instructions: string = '') => {
    setCart((prev) => {
      const existingIndex = prev.findIndex(
        (i) => i.menuItemId === dish.id && (i.specialInstructions || '') === instructions.trim()
      );
      if (existingIndex > -1) {
        const next = [...prev];
        next[existingIndex].quantity += 1;
        return next;
      }
      return [
        ...prev,
        {
          menuItemId: dish.id,
          name: dish.name,
          price: dish.price,
          quantity: 1,
          isVeg: dish.isVeg,
          spiceLevel: dish.spiceLevel,
          imageUrl: dish.imageUrl,
          specialInstructions: instructions.trim() || undefined,
        },
      ];
    });
    setCustomizingItem(null);
    setCustomInstructions('');
  };

  const handleUpdateQuantity = (index: number, delta: number) => {
    setCart((prev) => {
      const updated = [...prev];
      const target = updated[index];
      if (!target) return prev;
      const newQty = target.quantity + delta;
      if (newQty <= 0) {
        return updated.filter((_, i) => i !== index);
      }
      updated[index] = { ...target, quantity: newQty };
      return updated;
    });
  };

  // Place Order
  const handlePlaceOrder = async () => {
    if (cart.length === 0 || isSubmittingOrder) return;
    setIsSubmittingOrder(true);

    try {
      const orderNumber = generateOrderNumber();
      const ordersCol = collection(db, 'orders');
      const newOrderDoc = doc(ordersCol);
      const totalAmount = calculateCartTotal(cart);

      const cleanItems = cart.map((item) => ({
        menuItemId: item.menuItemId,
        name: item.name,
        price: item.price,
        quantity: item.quantity,
        isVeg: item.isVeg,
        spiceLevel: item.spiceLevel,
        imageUrl: item.imageUrl || '',
        specialInstructions: item.specialInstructions || '',
      }));

      const orderPayload: any = {
        orderNumber,
        tableId: String(tableId),
        customerName: customerName.trim() || '',
        items: cleanItems,
        totalAmount,
        paymentMethod,
        paymentStatus: 'paid', // Demo payment simulation
        status: 'received',
        specialInstructions: orderInstructions.trim() || '',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await setDoc(newOrderDoc, orderPayload);

      // Track order in state
      const createdOrder: Order = { id: newOrderDoc.id, ...orderPayload };
      setActiveOrderIds((prev) => [newOrderDoc.id, ...prev]);
      setActiveTrackingOrder(createdOrder);

      // Clear cart
      setCart([]);
      setIsCartOpen(false);
      setOrderInstructions('');
    } catch (error) {
      console.error('Order submission error:', error);
      alert('Could not submit order. Please check network and try again.');
    } finally {
      setIsSubmittingOrder(false);
    }
  };

  // Call Waiter / Service Request
  const handleServiceRequest = async (type: ServiceRequestType, title: string) => {
    setIsSendingRequest(true);
    try {
      const reqCol = collection(db, 'serviceRequests');
      const newReqDoc = doc(reqCol);
      await setDoc(newReqDoc, {
        tableId: String(tableId),
        type,
        status: 'pending',
        createdAt: Date.now(),
      });
      setWaiterRequestSent(title);
      setIsWaiterModalOpen(false);
      setTimeout(() => setWaiterRequestSent(null), 4000);
    } catch (err) {
      console.error('Service request error:', err);
      alert('Unable to send request. Please alert staff.');
    } finally {
      setIsSendingRequest(false);
    }
  };

  const cartTotal = calculateCartTotal(cart);
  const totalCartItems = calculateTotalItems(cart);

  // Latest active order for banner
  const latestOrder = trackedOrders[0];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-28">
      {/* Top Navbar */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-slate-900 text-white flex items-center justify-center font-bold text-base shadow-xs">
              DF
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold tracking-tight text-slate-900">DineFlow</h1>
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-slate-100 text-slate-800 border border-slate-300">
                  Table {tableId}
                </span>
              </div>
              <p className="text-[11px] text-slate-500">Fine Dining • Digital Table Service</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* View Active Orders Tracker Button if any */}
            {trackedOrders.length > 0 && (
              <button
                type="button"
                onClick={() => setActiveTrackingOrder(latestOrder)}
                className="px-2.5 py-1.5 text-xs font-medium rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-900 flex items-center gap-1.5 hover:bg-indigo-100 transition-colors"
              >
                <Clock className="w-3.5 h-3.5 text-indigo-700 animate-pulse" />
                <span>Track Order</span>
                <span className="w-2 h-2 rounded-full bg-indigo-600" />
              </button>
            )}

            {/* Cart Trigger in Header */}
            {totalCartItems > 0 && (
              <button
                type="button"
                onClick={() => setIsCartOpen(true)}
                className="relative p-2 rounded-lg bg-slate-900 text-white hover:bg-slate-800 transition-colors shadow-xs"
                aria-label={`Shopping Cart with ${totalCartItems} items`}
              >
                <ShoppingBag className="w-4 h-4" />
                <span className="absolute -top-1 -right-1 bg-amber-500 text-slate-950 font-bold text-[10px] w-4 h-4 rounded-full flex items-center justify-center">
                  {totalCartItems}
                </span>
              </button>
            )}
          </div>
        </div>

        {/* Live Order Status Strip (if there is an ongoing order) */}
        {latestOrder && latestOrder.status !== 'completed' && latestOrder.status !== 'rejected' && (
          <div
            onClick={() => setActiveTrackingOrder(latestOrder)}
            className="cursor-pointer bg-slate-900 text-white px-4 py-2 border-t border-slate-800 flex items-center justify-between hover:bg-slate-800 transition-colors"
          >
            <div className="flex items-center gap-2 text-xs">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              <span className="font-medium text-slate-300">Order {latestOrder.orderNumber}:</span>
              <span className="font-semibold text-emerald-300">
                {getStatusDetails(latestOrder.status).label}
              </span>
            </div>
            <div className="flex items-center gap-1 text-[11px] text-slate-400">
              <span>View status</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </div>
          </div>
        )}
      </header>

      {/* Main Container */}
      <main className="max-w-3xl mx-auto px-4 py-4 space-y-4">
        {/* Service Request Banner Feedback */}
        {waiterRequestSent && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <span>
              <strong>Request Sent!</strong> Staff has been notified for Table {tableId} ({waiterRequestSent}).
            </span>
          </div>
        )}

        {/* Search & Veg Filter */}
        <div className="space-y-3 bg-white p-3.5 rounded-xl border border-gray-200 shadow-2xs">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
            <input
              type="text"
              placeholder="Search dishes, curries, drinks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-slate-900 focus:bg-white text-slate-900"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-3 text-slate-400 hover:text-slate-600"
                aria-label="Clear search"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="flex items-center justify-between pt-1">
            <span className="text-xs text-slate-500 font-medium">Dietary preference</span>
            <label className="inline-flex items-center gap-2 cursor-pointer select-none">
              <span className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                <VegNonVegIndicator isVeg={true} size="sm" />
                Veg Only
              </span>
              <input
                type="checkbox"
                checked={vegOnly}
                onChange={(e) => setVegOnly(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-8 h-4 bg-gray-200 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-emerald-600 relative"></div>
            </label>
          </div>
        </div>

        {/* Category Filter Chips */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
          {categories.map((category) => (
            <button
              key={category}
              type="button"
              onClick={() => setSelectedCategory(category)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-colors border ${
                selectedCategory === category
                  ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                  : 'bg-white text-slate-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              {category}
            </button>
          ))}
        </div>

        {/* Menu Items List */}
        {loadingMenu ? (
          <div className="py-16 text-center text-slate-400 text-sm">
            <div className="w-6 h-6 border-2 border-slate-900 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            Loading fresh menu...
          </div>
        ) : visibleDishes.length === 0 ? (
          <div className="py-12 text-center bg-white rounded-xl border border-gray-200 p-6">
            <UtensilsCrossed className="w-8 h-8 mx-auto text-slate-400 mb-2" />
            <p className="text-sm font-semibold text-slate-800">No dishes found</p>
            <p className="text-xs text-slate-500 mt-1">
              Try adjusting your search query or dietary filters.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {visibleDishes.map((dish) => {
              // Calculate quantity of this dish in cart
              const inCartQty = cart
                .filter((item) => item.menuItemId === dish.id)
                .reduce((s, i) => s + i.quantity, 0);

              return (
                <article
                  key={dish.id}
                  className="bg-white rounded-xl border border-gray-200 p-3.5 flex gap-3.5 hover:border-gray-300 transition-shadow shadow-2xs"
                >
                  {/* Left Info */}
                  <div className="flex-1 min-w-0 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <VegNonVegIndicator isVeg={dish.isVeg} size="sm" />
                        <SpiceIndicator level={dish.spiceLevel} />
                        <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
                          {dish.category}
                        </span>
                      </div>

                      <h3 className="font-bold text-sm text-slate-900 leading-snug">
                        {dish.name}
                      </h3>

                      <p className="text-xs text-slate-600 line-clamp-2 mt-1 leading-relaxed">
                        {dish.description}
                      </p>
                    </div>

                    <div className="flex items-center justify-between mt-3">
                      <span className="font-bold text-base text-slate-900">
                        {formatINR(dish.price)}
                      </span>

                      {/* Add or Quantity Controls */}
                      {inCartQty === 0 ? (
                        <button
                          type="button"
                          onClick={() => setCustomizingItem(dish)}
                          className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-slate-900 text-white hover:bg-slate-800 transition-colors flex items-center gap-1 shadow-xs"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>ADD</span>
                        </button>
                      ) : (
                        <div className="flex items-center bg-slate-900 text-white rounded-lg p-0.5 shadow-xs">
                          <button
                            type="button"
                            onClick={() => {
                              const cartIdx = cart.findIndex((i) => i.menuItemId === dish.id);
                              if (cartIdx > -1) handleUpdateQuantity(cartIdx, -1);
                            }}
                            className="p-1 hover:bg-slate-800 rounded transition-colors"
                            aria-label="Decrease quantity"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <span className="px-2 text-xs font-bold text-center min-w-[20px]">
                            {inCartQty}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleAddToCart(dish)}
                            className="p-1 hover:bg-slate-800 rounded transition-colors"
                            aria-label="Increase quantity"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right Image */}
                  <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-lg overflow-hidden flex-shrink-0 bg-gray-100 border border-gray-200 relative">
                    <img
                      src={dish.imageUrl}
                      alt={dish.name}
                      loading="lazy"
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        // Fallback image
                        (e.target as HTMLImageElement).src =
                          'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=800&auto=format&fit=crop&q=80';
                      }}
                    />
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </main>

      {/* Permanently Visible Call Waiter Floating Button */}
      <div className="fixed bottom-6 left-4 z-40">
        <button
          type="button"
          onClick={() => setIsWaiterModalOpen(true)}
          className="px-3.5 py-2.5 bg-white border border-gray-300 text-slate-800 rounded-full shadow-lg hover:bg-gray-50 flex items-center gap-2 text-xs font-semibold transition-transform active:scale-95"
          aria-label="Call Waiter"
        >
          <Bell className="w-4 h-4 text-amber-600" />
          <span>Call Waiter</span>
        </button>
      </div>

      {/* Bottom Sticky Floating Cart Bar */}
      {totalCartItems > 0 && !isCartOpen && (
        <div className="fixed bottom-6 right-4 z-40 max-w-xs">
          <button
            type="button"
            onClick={() => setIsCartOpen(true)}
            className="px-4 py-2.5 bg-slate-900 text-white rounded-full shadow-xl hover:bg-slate-800 flex items-center gap-3 text-xs font-semibold transition-transform active:scale-95"
          >
            <div className="flex items-center gap-1.5">
              <ShoppingBag className="w-4 h-4 text-amber-400" />
              <span>{totalCartItems} items</span>
            </div>
            <span className="w-1 h-1 rounded-full bg-slate-600" />
            <span className="font-bold text-amber-400">{formatINR(cartTotal)}</span>
            <ChevronRight className="w-4 h-4 text-slate-400" />
          </button>
        </div>
      )}

      {/* Item Customization & Special Instructions Modal */}
      {customizingItem && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-xl border border-gray-200 overflow-hidden shadow-2xl animate-in slide-in-from-bottom duration-200">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <VegNonVegIndicator isVeg={customizingItem.isVeg} size="sm" />
                <h3 className="font-bold text-sm text-slate-900">{customizingItem.name}</h3>
              </div>
              <button
                onClick={() => setCustomizingItem(null)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-md"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-600 font-medium">Price</span>
                <span className="font-bold text-slate-900">{formatINR(customizingItem.price)}</span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Special Instructions (Optional)
                </label>
                <textarea
                  rows={2}
                  value={customInstructions}
                  onChange={(e) => setCustomInstructions(e.target.value)}
                  placeholder="e.g. Less spicy, no onion/garlic, extra crispy..."
                  className="w-full text-xs p-2.5 bg-gray-50 border border-gray-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-slate-900 text-slate-900"
                />
              </div>

              <button
                type="button"
                onClick={() => handleAddToCart(customizingItem, customInstructions)}
                className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-2 shadow-xs"
              >
                <span>Add to Cart</span>
                <span>•</span>
                <span>{formatINR(customizingItem.price)}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cart & Checkout Sheet */}
      {isCartOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-xl border border-gray-200 max-h-[90vh] flex flex-col shadow-2xl animate-in slide-in-from-bottom duration-200">
            {/* Header */}
            <div className="p-4 border-b border-gray-200 flex items-center justify-between bg-slate-900 text-white rounded-t-2xl sm:rounded-t-xl">
              <div>
                <div className="flex items-center gap-2">
                  <ShoppingBag className="w-4 h-4 text-amber-400" />
                  <h3 className="font-bold text-sm">Order Summary</h3>
                </div>
                <p className="text-[11px] text-slate-400">Table {tableId} • DineFlow</p>
              </div>
              <button
                onClick={() => setIsCartOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-md"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Cart Items List */}
            <div className="p-4 overflow-y-auto space-y-3 flex-1">
              {cart.map((item, idx) => (
                <div
                  key={`${item.menuItemId}-${idx}`}
                  className="flex items-start justify-between py-2 border-b border-gray-100 last:border-b-0"
                >
                  <div className="flex-1 pr-2">
                    <div className="flex items-center gap-1.5">
                      <VegNonVegIndicator isVeg={item.isVeg} size="sm" />
                      <span className="text-xs font-bold text-slate-900">{item.name}</span>
                    </div>
                    {item.specialInstructions && (
                      <p className="text-[11px] text-amber-700 italic mt-0.5">
                        Note: {item.specialInstructions}
                      </p>
                    )}
                    <span className="text-xs text-slate-600 block mt-1">
                      {formatINR(item.price)} each
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="flex items-center border border-gray-300 rounded-lg bg-gray-50">
                      <button
                        type="button"
                        onClick={() => handleUpdateQuantity(idx, -1)}
                        className="p-1 hover:bg-gray-200 rounded-l text-slate-700"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="px-2 text-xs font-bold text-slate-900">{item.quantity}</span>
                      <button
                        type="button"
                        onClick={() => handleUpdateQuantity(idx, 1)}
                        className="p-1 hover:bg-gray-200 rounded-r text-slate-700"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>

                    <span className="text-xs font-bold text-slate-900 min-w-[55px] text-right">
                      {formatINR(item.price * item.quantity)}
                    </span>
                  </div>
                </div>
              ))}

              {/* Customer Details Form */}
              <div className="pt-2 space-y-3 border-t border-gray-200 mt-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Your Name (Optional)
                  </label>
                  <input
                    type="text"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="e.g. Rahul Sharma"
                    className="w-full text-xs px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-slate-900 text-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Kitchen Cooking Instructions (Optional)
                  </label>
                  <input
                    type="text"
                    value={orderInstructions}
                    onChange={(e) => setOrderInstructions(e.target.value)}
                    placeholder="e.g. Serve starters first, less oil..."
                    className="w-full text-xs px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-slate-900 text-slate-900"
                  />
                </div>

                {/* Simulated Payment Selector */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Select Payment Method (Demo)
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: 'upi', label: 'UPI / QR', icon: QrCode },
                      { id: 'card', label: 'Card', icon: CreditCard },
                      { id: 'cash', label: 'Cash', icon: Banknote },
                    ].map((p) => {
                      const Icon = p.icon;
                      const isSelected = paymentMethod === p.id;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setPaymentMethod(p.id as PaymentMethod)}
                          className={`p-2 rounded-lg border text-xs font-medium flex flex-col items-center gap-1 transition-all ${
                            isSelected
                              ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                              : 'bg-white text-slate-700 border-gray-300 hover:bg-gray-50'
                          }`}
                        >
                          <Icon className="w-4 h-4" />
                          <span>{p.label}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Mandated Disclaimer */}
                  <div className="mt-2.5 p-2 bg-amber-50 border border-amber-200 rounded-lg">
                    <p className="text-[11px] font-semibold text-amber-900 text-center tracking-tight">
                      DEMO PAYMENT — NO REAL MONEY WILL BE CHARGED.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer with Subtotal & Place Order */}
            <div className="p-4 border-t border-gray-200 bg-gray-50 space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="font-semibold text-slate-600">Total Amount</span>
                <span className="font-extrabold text-base text-slate-900">
                  {formatINR(cartTotal)}
                </span>
              </div>

              <button
                type="button"
                disabled={isSubmittingOrder || cart.length === 0}
                onClick={handlePlaceOrder}
                className="w-full py-3 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-colors shadow-xs"
              >
                {isSubmittingOrder ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <span>Place Order</span>
                    <span>•</span>
                    <span>{formatINR(cartTotal)}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Permanently Visible Call Waiter Modal */}
      {isWaiterModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white w-full max-w-sm rounded-xl border border-gray-200 shadow-2xl p-5 space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-amber-600" />
                <h3 className="font-bold text-sm text-slate-900">Table {tableId} Service</h3>
              </div>
              <button
                onClick={() => setIsWaiterModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-md"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-600">
              Select your request. Our floor staff will attend to Table {tableId} immediately.
            </p>

            <div className="grid grid-cols-2 gap-2.5">
              {[
                { type: 'call_waiter', label: 'Call Waiter', icon: Bell },
                { type: 'water', label: 'Request Water', icon: GlassWater },
                { type: 'assistance', label: 'Assistance', icon: HelpCircle },
                { type: 'bill', label: 'Request Bill', icon: FileText },
              ].map((req) => {
                const Icon = req.icon;
                return (
                  <button
                    key={req.type}
                    type="button"
                    disabled={isSendingRequest}
                    onClick={() => handleServiceRequest(req.type as ServiceRequestType, req.label)}
                    className="p-3 bg-gray-50 border border-gray-200 hover:bg-slate-900 hover:text-white rounded-lg text-xs font-semibold text-slate-800 flex flex-col items-center gap-1.5 transition-colors group"
                  >
                    <Icon className="w-5 h-5 text-slate-700 group-hover:text-white transition-colors" />
                    <span>{req.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Order Tracking Modal with Real-time Status */}
      {activeTrackingOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white w-full max-w-md rounded-xl border border-gray-200 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <div>
                <span className="text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
                  Order Status
                </span>
                <h3 className="font-bold text-base">{activeTrackingOrder.orderNumber}</h3>
              </div>
              <button
                onClick={() => setActiveTrackingOrder(null)}
                className="text-slate-400 hover:text-white p-1 rounded-md"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-5">
              {/* Status Badge */}
              <div className="text-center p-3 bg-gray-50 border border-gray-200 rounded-lg">
                <span className="text-xs text-slate-500 font-medium block">Current Status</span>
                <span
                  className={`inline-block mt-1 px-3 py-1 text-xs font-bold rounded-full border ${
                    getStatusDetails(activeTrackingOrder.status).colorClass
                  }`}
                >
                  {getStatusDetails(activeTrackingOrder.status).label}
                </span>
                <p className="text-[11px] text-slate-500 mt-1">
                  Updates in real time as the kitchen team prepares your dishes.
                </p>
              </div>

              {/* 5-step visual timeline */}
              {activeTrackingOrder.status !== 'rejected' && (
                <div className="space-y-2 py-1">
                  {[
                    { step: 1, key: 'received', title: 'Order Received', desc: 'Sent to kitchen' },
                    { step: 2, key: 'accepted', title: 'Accepted', desc: 'Order confirmed by staff' },
                    { step: 3, key: 'preparing', title: 'Preparing', desc: 'Chefs are cooking' },
                    { step: 4, key: 'ready', title: 'Ready', desc: 'Plated for your table' },
                    { step: 5, key: 'completed', title: 'Completed', desc: 'Served & enjoyed' },
                  ].map((stage, idx) => {
                    const currentStep = getStatusDetails(activeTrackingOrder.status).step;
                    const isDone = stage.step <= currentStep;
                    const isCurrent = stage.step === currentStep;

                    return (
                      <div key={stage.key} className="flex items-center gap-3">
                        <div
                          className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                            isDone
                              ? 'bg-slate-900 text-white'
                              : 'bg-gray-100 text-slate-400 border border-gray-200'
                          }`}
                        >
                          {isDone ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : stage.step}
                        </div>
                        <div className="flex-1">
                          <p
                            className={`text-xs font-semibold ${
                              isCurrent
                                ? 'text-slate-900 font-bold'
                                : isDone
                                ? 'text-slate-700'
                                : 'text-slate-400'
                            }`}
                          >
                            {stage.title}
                          </p>
                          <p className="text-[10px] text-slate-500">{stage.desc}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Order Items Summary */}
              <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg text-xs space-y-1.5">
                <div className="flex justify-between font-semibold text-slate-800 pb-1 border-b border-gray-200">
                  <span>Items</span>
                  <span>Amount</span>
                </div>
                {activeTrackingOrder.items.map((item, i) => (
                  <div key={i} className="flex justify-between text-slate-600">
                    <span>
                      {item.quantity} × {item.name}
                    </span>
                    <span>{formatINR(item.price * item.quantity)}</span>
                  </div>
                ))}
                <div className="flex justify-between font-bold text-slate-900 pt-1.5 border-t border-gray-200">
                  <span>Total</span>
                  <span>{formatINR(activeTrackingOrder.totalAmount)}</span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setActiveTrackingOrder(null)}
                className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold transition-colors"
              >
                Back to Menu
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
