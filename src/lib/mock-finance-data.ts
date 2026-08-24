import { LocalRide, LocalExpense, LocalCashHandover, LocalCashReconciliation, LocalPayer, LocalAdvance } from './db/dexie';

const generateId = () => Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

export const MOCK_PAYERS: LocalPayer[] = [
  { id: 'PAY-001', name: 'ABC Umrah Agency', type: 'Organization', createdAt: Date.now() },
  { id: 'PAY-002', name: 'Global Umrah Services', type: 'Organization', createdAt: Date.now() },
  { id: 'PAY-003', name: 'Al Madinah Travels', type: 'Organization', createdAt: Date.now() },
  { id: 'PAY-004', name: 'Saudi Pilgrim Tours', type: 'Organization', createdAt: Date.now() },
];

export const MOCK_HANDOVERS: LocalCashHandover[] = [
  {
    id: generateId(),
    date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    amount: 500,
    handedTo: 'Office Manager',
    reference: 'HO-1029',
    syncStatus: 'synced',
    createdAt: Date.now() - 2 * 24 * 60 * 60 * 1000
  }
];

export const MOCK_RECONCILIATIONS: LocalCashReconciliation[] = [
  {
    id: generateId(),
    date: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    expectedCash: 1200,
    actualCash: 1200,
    difference: 0,
    syncStatus: 'synced',
    createdAt: Date.now() - 1 * 24 * 60 * 60 * 1000
  }
];

export const MOCK_ADVANCES: LocalAdvance[] = [
  {
    id: generateId(),
    driverId: 'DRV-123',
    driverName: 'Ahmed Yilmaz',
    amount: 2000,
    advanceType: 'Cash Advance',
    date: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    recoveredAmount: 500,
    outstandingAmount: 1500,
    status: 'Partially Recovered',
    syncStatus: 'synced',
    createdAt: Date.now() - 15 * 24 * 60 * 60 * 1000
  },
  {
    id: generateId(),
    driverId: 'DRV-123',
    driverName: 'Ahmed Yilmaz',
    amount: 500,
    advanceType: 'Maintenance Advance',
    date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    recoveredAmount: 0,
    outstandingAmount: 500,
    status: 'Pending',
    syncStatus: 'synced',
    createdAt: Date.now() - 5 * 24 * 60 * 60 * 1000
  }
];

// Generate 30 realistic rides over the past month
export const MOCK_FINANCE_RIDES: LocalRide[] = [];
export const MOCK_FINANCE_EXPENSES: LocalExpense[] = [];

const today = new Date();

for (let i = 0; i < 30; i++) {
  const date = new Date(today.getTime() - i * 1.5 * 24 * 60 * 60 * 1000);
  const dateStr = date.toISOString().split('T')[0];
  
  const isVoucher = i % 3 === 0; // Every 3rd ride is a voucher
  
  MOCK_FINANCE_RIDES.push({
    id: generateId(),
    date: dateStr,
    amount: isVoucher ? 450 + (i * 10) : 350 + (i * 5),
    revenueType: isVoucher ? 'VOUCHER' : 'CASH',
    paymentStatus: isVoucher ? (i < 10 ? 'Outstanding' : 'Collected') : 'Received',
    payerId: isVoucher ? MOCK_PAYERS[i % MOCK_PAYERS.length].id : undefined,
    voucherReference: isVoucher ? `REF-${i * 100}` : undefined,
    syncStatus: 'synced',
    createdAt: date.getTime(),
  });

  // Add some expenses
  if (i % 3 === 0) {
    const isCashExpense = i % 2 === 0;
    const category = i % 4 === 0 ? 'Fuel' : (i % 5 === 0 ? 'Maintenance' : (i % 7 === 0 ? 'Parking' : 'Toll'));
    const paymentSource = isCashExpense ? 'Cash' : (i % 5 === 0 ? 'Bank Transfer' : 'Company Card');
    
    MOCK_FINANCE_EXPENSES.push({
      id: generateId(),
      date: dateStr,
      time: '14:30',
      amount: category === 'Maintenance' ? 450 : (category === 'Fuel' ? 120 : 35),
      category,
      allocation: category === 'Fuel' || category === 'Maintenance' ? 'Current Vehicle' : 'Driver',
      vehicleId: category === 'Fuel' || category === 'Maintenance' ? 'VEH-001' : undefined,
      paymentSource: paymentSource as 'Cash' | 'Company Card' | 'Bank Transfer' | 'Other',
      description: category === 'Maintenance' ? 'Oil change and filter' : undefined,
      receiptImageBase64: (category === 'Fuel' || category === 'Maintenance') ? 'data:image/png;base64,iVBORw0KGgo...' : undefined,
      syncStatus: 'synced',
      createdAt: date.getTime()
    });
  }
}

// Ensure there's some data for today specifically to show on the dashboard
const todayStr = today.toISOString().split('T')[0];
MOCK_FINANCE_RIDES.push(
  {
    id: generateId(),
    date: todayStr,
    amount: 1500,
    revenueType: 'CASH',
    paymentStatus: 'Received',
    syncStatus: 'synced',
    createdAt: today.getTime()
  },
  {
    id: generateId(),
    date: todayStr,
    amount: 750,
    revenueType: 'VOUCHER',
    paymentStatus: 'Outstanding',
    payerId: MOCK_PAYERS[0].id,
    voucherReference: 'TODAY-VOUCH-1',
    syncStatus: 'synced',
    createdAt: today.getTime()
  }
);

MOCK_FINANCE_EXPENSES.push(
  {
    id: generateId(),
    date: todayStr,
    time: '09:15',
    amount: 300,
    category: 'Fuel',
    allocation: 'Current Vehicle',
    vehicleId: 'VEH-001',
    paymentSource: 'Cash',
    receiptImageBase64: 'data:image/png;base64,iVBORw0KGgo...',
    syncStatus: 'synced',
    createdAt: today.getTime()
  },
  {
    id: generateId(),
    date: todayStr,
    time: '12:00',
    amount: 600,
    category: 'Maintenance',
    allocation: 'Current Vehicle',
    vehicleId: 'VEH-001',
    paymentSource: 'Company Card',
    description: 'New brake pads',
    receiptImageBase64: 'data:image/png;base64,iVBORw0KGgo...',
    syncStatus: 'synced',
    createdAt: today.getTime() + 1000
  }
);
