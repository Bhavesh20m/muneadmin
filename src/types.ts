export type Category = 
  | 'All'
  | 'Starters'
  | 'Main Course'
  | 'Breads & Rice'
  | 'Desserts'
  | 'Beverages';

export interface MenuItem {
  id: string;
  name: string;
  description: string;
  price: number;
  category: Category | string;
  imageUrl: string;
  isVeg: boolean;
  spiceLevel: number; // 0 = None, 1 = Mild, 2 = Medium, 3 = Spicy
  isAvailable: boolean;
  isPublished: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface CartItem {
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
  isVeg: boolean;
  spiceLevel: number;
  imageUrl: string;
  specialInstructions?: string;
}

export type OrderStatus = 
  | 'received'
  | 'accepted'
  | 'preparing'
  | 'ready'
  | 'completed'
  | 'rejected';

export type PaymentMethod = 'cash' | 'upi' | 'card';
export type PaymentStatus = 'paid' | 'pending';

export interface Order {
  id: string;
  orderNumber: string;
  tableId: string;
  customerName?: string;
  items: CartItem[];
  totalAmount: number;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  status: OrderStatus;
  specialInstructions?: string;
  createdAt: number;
  updatedAt: number;
}

export type ServiceRequestType = 'call_waiter' | 'water' | 'assistance' | 'bill';

export interface ServiceRequest {
  id: string;
  tableId: string;
  type: ServiceRequestType;
  status: 'pending' | 'resolved';
  createdAt: number;
}
