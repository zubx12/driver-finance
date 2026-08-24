export type PeriodStatus = 'Open' | 'Under Review' | 'Finalized' | 'Partially Paid' | 'Paid' | 'Adjusted' | 'Disputed';

export interface Partner {
  id: string;
  name: string;
  status: 'Active' | 'Inactive';
  joinedDate: string; // YYYY-MM-DD
}

export interface PartnerVehicle {
  id: string;
  make: string;
  model: string;
  year: number;
  plateNumber: string;
  status: 'Active' | 'Maintenance' | 'Inactive';
}

export interface OwnershipArrangement {
  id: string;
  vehicleId: string;
  partnerId: string;
  percentage: number;
  effectiveFrom: string; // YYYY-MM-DD
  effectiveTo: string | null; // YYYY-MM-DD, null if current
  status: 'Active' | 'Ended';
}

export interface Settlement {
  id: string;
  period: string; // e.g., 'July 2026'
  vehicleId: string;
  partnerId: string;
  ownershipPercentage: number;
  finalizedShare: number;
  paidAmount: number;
  remainingAmount: number;
  status: PeriodStatus;
  paymentDate: string | null;
}

export interface Driver {
  id: string;
  name: string;
}

// ------------------------------------------------------------------
// NEW RAW TRANSACTIONAL MODELS
// ------------------------------------------------------------------

export interface MockRide {
  id: string;
  date: string; // YYYY-MM-DD
  vehicleId: string;
  driverId: string;
  amount: number;
  paymentMethod: 'Cash' | 'Voucher' | 'Card' | 'Transfer';
  payerId?: string; // If Voucher
  reference?: string;
}

export interface MockExpense {
  id: string;
  date: string; // YYYY-MM-DD
  vehicleId: string;
  driverId: string;
  amount: number;
  category: string;
  paymentMethod: 'Cash' | 'Card' | 'Transfer'; // To track if it reduces driver cash
  description?: string;
  receiptUrl?: string;
}

export interface CashHandover {
  id: string;
  date: string; // YYYY-MM-DD
  vehicleId: string;
  driverId: string;
  amount: number;
  handedTo: string;
  reference: string;
  status: 'Confirmed' | 'Pending';
}

export interface CashAdjustment {
  id: string;
  date: string;
  vehicleId: string;
  driverId: string;
  amount: number; // Positive means driver owes more, Negative means driver is credited
  reason: string;
  status: 'Approved' | 'Pending';
}

export interface Payer {
  id: string;
  name: string;
  contact: string;
}

export interface VoucherCollection {
  id: string;
  date: string; // YYYY-MM-DD
  payerId: string;
  amount: number;
  paymentMethod: 'Bank Transfer' | 'Cash' | 'Card' | 'Other';
  reference: string;
}
