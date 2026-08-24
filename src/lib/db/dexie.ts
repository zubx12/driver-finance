import Dexie, { type Table } from 'dexie';

export interface LocalPayer {
  id: string;
  name: string;
  type: 'Organization' | 'Individual';
  createdAt: number;
}

export interface LocalRide {
  id: string;
  date: string; // YYYY-MM-DD
  time?: string; // HH:mm
  amount: number;
  revenueType: 'CASH' | 'VOUCHER';
  paymentStatus: 'Received' | 'Outstanding' | 'Partially Collected' | 'Collected' | 'Disputed' | 'Cancelled';
  payerId?: string;
  voucherReference?: string;
  notes?: string;
  evidenceImageBase64?: string;
  syncStatus: 'pending' | 'synced' | 'failed';
  createdAt: number;
}

export interface LocalExpense {
  id: string;
  date: string; // YYYY-MM-DD
  time?: string; // HH:mm
  amount: number;
  category: string;
  allocation: 'Current Vehicle' | 'Driver' | 'Other / Company';
  vehicleId?: string;
  paymentSource: 'Cash' | 'Company Card' | 'Bank Transfer' | 'Other';
  description?: string; // Replaces remarks
  receiptImageBase64?: string; // Now optional conditionally
  syncStatus: 'pending' | 'synced' | 'failed';
  createdAt: number;
}

export interface LocalCashHandover {
  id: string;
  date: string; // YYYY-MM-DD
  amount: number;
  handedTo: string;
  reference?: string;
  notes?: string;
  syncStatus: 'pending' | 'synced' | 'failed';
  createdAt: number;
}

export interface LocalCashReconciliation {
  id: string;
  date: string;
  expectedCash: number;
  actualCash: number;
  difference: number;
  reason?: string;
  explanation?: string;
  syncStatus: 'pending' | 'synced' | 'failed';
  createdAt: number;
}

export interface LocalAdvance {
  id: string;
  driverId: string;
  driverName: string;
  vehicleId?: string;
  amount: number;
  advanceType: 'Cash Advance' | 'Salary Advance' | 'Maintenance Advance' | 'Other';
  date: string; // YYYY-MM-DD
  recoveredAmount: number;
  outstandingAmount: number;
  status: 'Pending' | 'Partially Recovered' | 'Fully Recovered';
  syncStatus: 'pending' | 'synced' | 'failed';
  createdAt: number;
}

export class DriverFinanceDB extends Dexie {
  rides!: Table<LocalRide, string>;
  expenses!: Table<LocalExpense, string>;
  payers!: Table<LocalPayer, string>;
  cashHandovers!: Table<LocalCashHandover, string>;
  cashReconciliations!: Table<LocalCashReconciliation, string>;
  advances!: Table<LocalAdvance, string>;

  constructor() {
    super('DriverFinanceDB');
    this.version(3).stores({
      rides: 'id, date, revenueType, paymentStatus, payerId, syncStatus, createdAt', 
      expenses: 'id, date, category, allocation, paymentSource, syncStatus, createdAt',
      payers: 'id, name',
      cashHandovers: 'id, date, syncStatus, createdAt',
      cashReconciliations: 'id, date, syncStatus, createdAt',
      advances: 'id, driverId, status, date, syncStatus, createdAt'
    });
  }
}

export const db = new DriverFinanceDB();
