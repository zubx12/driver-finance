import { 
  Partner, 
  PartnerVehicle, 
  OwnershipArrangement, 
  Settlement, 
  Driver,
  Payer,
  MockRide,
  MockExpense,
  CashHandover,
  VoucherCollection,
  CashAdjustment
} from '../types/partner';

export const MOCK_LOGGED_IN_PARTNER: Partner = {
  id: 'PTR-001',
  name: 'Mohammed Abdullah',
  status: 'Active',
  joinedDate: '2026-01-01'
};

export const MOCK_PARTNER_VEHICLES: PartnerVehicle[] = [
  { id: 'VH-001', make: 'Toyota', model: 'Camry', year: 2024, plateNumber: 'ABC 1234', status: 'Active' },
  { id: 'VH-002', make: 'Toyota', model: 'Hiace', year: 2023, plateNumber: 'XYZ 5678', status: 'Active' },
  { id: 'VH-003', make: 'GMC', model: 'Yukon', year: 2025, plateNumber: 'KSA 9876', status: 'Active' },
];

export const MOCK_OWNERSHIP: OwnershipArrangement[] = [
  { id: 'OWN-01', vehicleId: 'VH-001', partnerId: 'PTR-001', percentage: 35, effectiveFrom: '2026-01-01', effectiveTo: null, status: 'Active' },
  { id: 'OWN-02', vehicleId: 'VH-001', partnerId: 'PTR-002', percentage: 32.5, effectiveFrom: '2026-01-01', effectiveTo: null, status: 'Active' },
  { id: 'OWN-03', vehicleId: 'VH-001', partnerId: 'PTR-003', percentage: 32.5, effectiveFrom: '2026-01-01', effectiveTo: null, status: 'Active' },
  { id: 'OWN-04', vehicleId: 'VH-002', partnerId: 'PTR-001', percentage: 50, effectiveFrom: '2026-01-01', effectiveTo: null, status: 'Active' },
  { id: 'OWN-05', vehicleId: 'VH-002', partnerId: 'PTR-004', percentage: 50, effectiveFrom: '2026-01-01', effectiveTo: null, status: 'Active' },
  { id: 'OWN-06', vehicleId: 'VH-003', partnerId: 'PTR-001', percentage: 25, effectiveFrom: '2026-01-01', effectiveTo: null, status: 'Active' },
];

export const MOCK_SETTLEMENTS: Settlement[] = [
  { id: 'STL-01', period: 'July 2026', vehicleId: 'VH-001', partnerId: 'PTR-001', ownershipPercentage: 35, finalizedShare: 8400, paidAmount: 8400, remainingAmount: 0, status: 'Paid', paymentDate: '2026-08-10' },
  { id: 'STL-02', period: 'July 2026', vehicleId: 'VH-002', partnerId: 'PTR-001', ownershipPercentage: 50, finalizedShare: 12000, paidAmount: 12000, remainingAmount: 0, status: 'Paid', paymentDate: '2026-08-10' },
  { id: 'STL-04', period: 'August 2026', vehicleId: 'VH-001', partnerId: 'PTR-001', ownershipPercentage: 35, finalizedShare: 8165.50, paidAmount: 0, remainingAmount: 8165.50, status: 'Open', paymentDate: null },
];

export const MOCK_DRIVERS: Driver[] = [
  { id: 'DRV-01', name: 'Muhammad Ali' },
  { id: 'DRV-02', name: 'Ahmed Khan' },
  { id: 'DRV-03', name: 'Omar Hassan' },
];

export const MOCK_PAYERS: Payer[] = [
  { id: 'PAY-01', name: 'ABC Umrah Agency', contact: '050-123-4567' },
  { id: 'PAY-02', name: 'Global Umrah Services', contact: '055-987-6543' },
];

// --- GENERATING MOCK RAW DATA ---
// We need ~50+ rides mixed across July and August 2026.
const _rides: MockRide[] = [];
const _expenses: MockExpense[] = [];
const _handovers: CashHandover[] = [];
const _collections: VoucherCollection[] = [];
const _adjustments: CashAdjustment[] = [];

// Helper deterministic random
let seed = 12345;
function random() {
  const x = Math.sin(seed++) * 10000;
  return x - Math.floor(x);
}
function randomInt(min: number, max: number) {
  return Math.floor(random() * (max - min + 1)) + min;
}

const dates = [
  '2026-06-20', '2026-06-28',
  '2026-07-01', '2026-07-05', '2026-07-10', '2026-07-12', '2026-07-18', '2026-07-20', '2026-07-25', '2026-07-28',
  '2026-08-01', '2026-08-05', '2026-08-10', '2026-08-15', '2026-08-20', '2026-08-23'
];

let rideIdCounter = 1;
let expIdCounter = 1;
let hoIdCounter = 1;
let colIdCounter = 1;

dates.forEach(date => {
  MOCK_PARTNER_VEHICLES.forEach(vehicle => {
    // 1-3 rides per vehicle per date
    const numRides = randomInt(1, 3);
    const driverId = MOCK_DRIVERS[randomInt(0, 2)].id;
    
    let dailyCashRev = 0;
    
    for (let i = 0; i < numRides; i++) {
      const isVoucher = random() > 0.6;
      const amount = randomInt(150, 1500);
      
      _rides.push({
        id: `RIDE-${rideIdCounter++}`,
        date,
        vehicleId: vehicle.id,
        driverId,
        amount,
        paymentMethod: isVoucher ? 'Voucher' : 'Cash',
        payerId: isVoucher ? MOCK_PAYERS[randomInt(0, 1)].id : undefined,
        reference: `REF-${rideIdCounter * 99}`
      });
      
      if (!isVoucher) dailyCashRev += amount;
    }

    // 1 expense ~60% of the time
    let dailyCashExp = 0;
    if (random() > 0.4) {
      const expAmount = randomInt(50, 300);
      const isCash = random() > 0.2; // 80% chance driver paid cash
      const category = random() > 0.5 ? 'Fuel' : 'Maintenance';
      _expenses.push({
        id: `EXP-${expIdCounter++}`,
        date,
        vehicleId: vehicle.id,
        driverId,
        amount: expAmount,
        category,
        paymentMethod: isCash ? 'Cash' : 'Card',
        description: category === 'Fuel' ? 'Full tank petrol 91' : 'Scheduled oil change and filter',
        receiptUrl: expAmount > 100 ? 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=400&q=80' : undefined
      });
      if (isCash) dailyCashExp += expAmount;
    }

    // Handover what they owe, minus a random small discrepancy sometimes
    const expectedHandover = dailyCashRev - dailyCashExp;
    if (expectedHandover > 0) {
      // 80% time they hand over exactly. 20% time they hold onto some cash.
      const handOverAmount = random() > 0.2 ? expectedHandover : expectedHandover - randomInt(50, 200);
      if (handOverAmount > 0) {
        _handovers.push({
          id: `HO-${hoIdCounter++}`,
          date,
          vehicleId: vehicle.id,
          driverId,
          amount: handOverAmount,
          handedTo: 'Office',
          reference: `HREF-${hoIdCounter * 42}`,
          status: 'Confirmed'
        });
      }
    }
  });
});

// Create some voucher collections based on the generated rides
const voucherRides = _rides.filter(r => r.paymentMethod === 'Voucher');
// Collect about 50% of them
voucherRides.forEach(vr => {
  if (random() > 0.5) {
    _collections.push({
      id: `COL-${colIdCounter++}`,
      date: '2026-08-25', // collected later
      payerId: vr.payerId!,
      amount: vr.amount, // Paid in full
      paymentMethod: 'Bank Transfer',
      reference: `TRF-${colIdCounter * 111}`
    });
  }
});

export const MOCK_RIDES = _rides;
export const MOCK_EXPENSES = _expenses;
export const MOCK_HANDOVERS = _handovers;
export const MOCK_COLLECTIONS = _collections;
export const MOCK_ADJUSTMENTS = _adjustments;
