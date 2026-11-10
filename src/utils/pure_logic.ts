import { CartItem, OrderStatus, Category } from '../types';

export function calculateCartTotal(items: CartItem[]): number {
  return items.reduce((sum, item) => sum + item.price * item.quantity, 0);
}

export function calculateTotalItems(items: CartItem[]): number {
  return items.reduce((sum, item) => sum + item.quantity, 0);
}

export function formatINR(amount: number): string {
  return `₹${amount.toLocaleString('en-IN')}`;
}

export function generateOrderNumber(): string {
  const random = Math.floor(1000 + Math.random() * 9000);
  return `DF-${random}`;
}

export function parseRoute(pathname: string): {
  portal: 'customer' | 'admin';
  tableId: string;
} {
  // Pattern: /customer/dineflow-demo/table/:tableId
  const customerMatch = pathname.match(/\/customer\/dineflow-demo\/table\/([^/?#]+)/);
  if (customerMatch && customerMatch[1]) {
    return {
      portal: 'customer',
      tableId: decodeURIComponent(customerMatch[1]),
    };
  }

  // Admin route: /admin/orders or /admin
  if (pathname.startsWith('/admin')) {
    return {
      portal: 'admin',
      tableId: '',
    };
  }

  // Default fallback is customer portal table 5
  return {
    portal: 'customer',
    tableId: '5',
  };
}

export function getStatusDetails(status: OrderStatus): {
  label: string;
  step: number;
  colorClass: string;
} {
  switch (status) {
    case 'received':
      return { label: 'Order Received', step: 1, colorClass: 'bg-blue-100 text-blue-800 border-blue-200' };
    case 'accepted':
      return { label: 'Accepted', step: 2, colorClass: 'bg-indigo-100 text-indigo-800 border-indigo-200' };
    case 'preparing':
      return { label: 'Preparing', step: 3, colorClass: 'bg-amber-100 text-amber-800 border-amber-200' };
    case 'ready':
      return { label: 'Ready for Serving', step: 4, colorClass: 'bg-emerald-100 text-emerald-800 border-emerald-200' };
    case 'completed':
      return { label: 'Completed', step: 5, colorClass: 'bg-slate-100 text-slate-800 border-slate-300' };
    case 'rejected':
      return { label: 'Rejected', step: 0, colorClass: 'bg-red-100 text-red-800 border-red-200' };
  }
}

export function filterDishes<T extends { name: string; description: string; category: string; isVeg: boolean; isAvailable: boolean; isPublished: boolean }>(
  dishes: T[],
  searchQuery: string,
  selectedCategory: string,
  vegOnly: boolean,
  customerView: boolean = true
): T[] {
  return dishes.filter((dish) => {
    if (customerView && (!dish.isPublished || !dish.isAvailable)) {
      return false;
    }
    if (vegOnly && !dish.isVeg) {
      return false;
    }
    if (selectedCategory !== 'All' && dish.category !== selectedCategory) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = dish.name.toLowerCase().includes(q);
      const matchDesc = dish.description.toLowerCase().includes(q);
      const matchCat = dish.category.toLowerCase().includes(q);
      if (!matchName && !matchDesc && !matchCat) {
        return false;
      }
    }
    return true;
  });
}
