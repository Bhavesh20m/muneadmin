import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateCartTotal,
  calculateTotalItems,
  formatINR,
  generateOrderNumber,
  parseRoute,
  getStatusDetails,
  filterDishes
} from './pure_logic';
import { CartItem } from '../types';

test('calculateCartTotal computes sum of price * quantity', () => {
  const items: CartItem[] = [
    { menuItemId: '1', name: 'Paneer Tikka', price: 280, quantity: 2, isVeg: true, spiceLevel: 2, imageUrl: '' },
    { menuItemId: '2', name: 'Butter Naan', price: 60, quantity: 3, isVeg: true, spiceLevel: 0, imageUrl: '' },
  ];
  assert.equal(calculateCartTotal(items), 280 * 2 + 60 * 3);
  assert.equal(calculateTotalItems(items), 5);
});

test('formatINR formats currency with Indian rupee sign', () => {
  assert.equal(formatINR(740), '₹740');
  assert.equal(formatINR(12500), '₹12,500');
});

test('generateOrderNumber generates DF- prefix and 4 digits', () => {
  const orderNum = generateOrderNumber();
  assert.match(orderNum, /^DF-\d{4}$/);
});

test('parseRoute extracts customer portal and tableId', () => {
  const route1 = parseRoute('/customer/dineflow-demo/table/5');
  assert.deepEqual(route1, { portal: 'customer', tableId: '5' });

  const route2 = parseRoute('/customer/dineflow-demo/table/12');
  assert.deepEqual(route2, { portal: 'customer', tableId: '12' });

  const routeAdmin = parseRoute('/admin/orders');
  assert.deepEqual(routeAdmin, { portal: 'admin', tableId: '' });

  const defaultRoute = parseRoute('/');
  assert.deepEqual(defaultRoute, { portal: 'customer', tableId: '5' });
});

test('getStatusDetails maps order statuses correctly', () => {
  assert.equal(getStatusDetails('received').step, 1);
  assert.equal(getStatusDetails('accepted').step, 2);
  assert.equal(getStatusDetails('preparing').step, 3);
  assert.equal(getStatusDetails('ready').step, 4);
  assert.equal(getStatusDetails('completed').step, 5);
  assert.equal(getStatusDetails('rejected').step, 0);
});

test('filterDishes filters unavailable and unpublished items for customer view', () => {
  const sampleDishes = [
    { name: 'Dal Makhani', description: 'Rich creamy lentils', category: 'Main Course', isVeg: true, isAvailable: true, isPublished: true },
    { name: 'Secret Special', description: 'Staff test', category: 'Main Course', isVeg: true, isAvailable: true, isPublished: false },
    { name: 'Sold Out Chicken', description: 'Tandoori chicken', category: 'Starters', isVeg: false, isAvailable: false, isPublished: true },
    { name: 'Butter Chicken', description: 'Classic creamy curry', category: 'Main Course', isVeg: false, isAvailable: true, isPublished: true }
  ];

  // Customer view should only see Dal Makhani and Butter Chicken
  const customerVisible = filterDishes(sampleDishes, '', 'All', false, true);
  assert.equal(customerVisible.length, 2);
  assert.equal(customerVisible[0].name, 'Dal Makhani');
  assert.equal(customerVisible[1].name, 'Butter Chicken');

  // Veg filter
  const vegOnly = filterDishes(sampleDishes, '', 'All', true, true);
  assert.equal(vegOnly.length, 1);
  assert.equal(vegOnly[0].name, 'Dal Makhani');

  // Search
  const searchResults = filterDishes(sampleDishes, 'creamy', 'All', false, true);
  assert.equal(searchResults.length, 2);
});
