import Dexie, { type Table } from 'dexie';

export interface LocalPayer {
  id: string;
  name: string;
  type: 'Organization' | 'Individual';
  createdAt: number;
  /** 'server' = id is a row in the payers table; otherwise added on this phone. */
  source?: 'server' | 'local';
}

/**
 * Sync state shared by rides and expenses.
 * - pending: waiting to upload, or retrying after a temporary error
 * - failed:  the server rejected it (a rule was broken); lastError says why
 * - synced:  stored on the server under the same id
 */
export type SyncStatus = 'pending' | 'synced' | 'failed';

interface SyncFields {
  syncStatus: SyncStatus;
  /** Driver who created the entry; it only ever syncs under this driver. */
  driverId?: string;
  attempts?: number;
  nextAttemptAt?: number;
  lastError?: string;
}

export interface LocalRide extends SyncFields {
  id: string; // also the server id once synced (srv- prefix = loaded from server by older app versions)
  date: string; // YYYY-MM-DD
  time?: string; // HH:mm
  amount: number;
  revenueType: 'CASH' | 'VOUCHER';
  paymentStatus: 'Received' | 'Outstanding' | 'Partially Collected' | 'Collected' | 'Disputed' | 'Cancelled';
  /** Vehicle at the time of the ride. */
  vehicleId?: string;
  payerId?: string;
  voucherReference?: string;
  notes?: string;
  evidenceImageBase64?: string;
  createdAt: number;
}

export interface LocalExpense extends SyncFields {
  id: string;
  date: string; // YYYY-MM-DD
  time?: string; // HH:mm
  amount: number;
  category: string;
  allocation: 'Current Vehicle' | 'Driver' | 'Other / Company';
  vehicleId?: string;
  /** 'Own Money': the driver's own pocket/card; the office owes it back (paid_by driver). */
  paymentSource: 'Cash' | 'Own Money' | 'Company Card' | 'Bank Transfer' | 'Other';
  description?: string; // Replaces remarks
  receiptImageBase64?: string; // Now optional conditionally
  createdAt: number;
}

export interface LocalCashHandover extends SyncFields {
  id: string; // also the server id once synced
  date: string; // YYYY-MM-DD
  amount: number;
  handedTo: string;
  reference?: string;
  notes?: string;
  /** Vehicle at the time of the handover (information for the office). */
  vehicleId?: string;
  /** The office's decision, refreshed from the server after upload. */
  reviewStatus?: 'submitted' | 'confirmed' | 'disputed';
  adminNote?: string;
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
