import { LocalRide, LocalExpense, LocalCashHandover } from './db/dexie';

export const INITIAL_OPENING_CASH = 500; // As requested in the mock data example

/**
 * Cash in Hand = Opening Cash + Cash Ride Revenue - Cash Expenses - Cash Handovers
 * IMPORTANT: Voucher revenue must NEVER be included in Cash in Hand.
 */
export function calculateCashInHand(
  rides: LocalRide[],
  expenses: LocalExpense[],
  handovers: LocalCashHandover[]
): number {
  const cashRidesTotal = rides
    .filter(r => r.revenueType === 'CASH')
    .reduce((sum, r) => sum + r.amount, 0);

  const cashExpensesTotal = expenses
    .filter(e => e.paymentSource === 'Cash')
    .reduce((sum, e) => sum + e.amount, 0);

  const handoversTotal = handovers
    .reduce((sum, h) => sum + h.amount, 0);

  return INITIAL_OPENING_CASH + cashRidesTotal - cashExpensesTotal - handoversTotal;
}

export function calculateTotalRevenue(rides: LocalRide[]): number {
  return rides.reduce((sum, r) => sum + r.amount, 0);
}

export function calculateCashRevenue(rides: LocalRide[]): number {
  return rides
    .filter(r => r.revenueType === 'CASH')
    .reduce((sum, r) => sum + r.amount, 0);
}

export function calculateVoucherRevenue(rides: LocalRide[]): number {
  return rides
    .filter(r => r.revenueType === 'VOUCHER')
    .reduce((sum, r) => sum + r.amount, 0);
}

export function calculateOutstandingVouchers(rides: LocalRide[]): number {
  return rides
    .filter(r => r.revenueType === 'VOUCHER' && r.paymentStatus !== 'Collected')
    .reduce((sum, r) => sum + r.amount, 0);
}

export function calculateCashExpenses(expenses: LocalExpense[]): number {
  return expenses
    .filter(e => e.paymentSource === 'Cash')
    .reduce((sum, e) => sum + e.amount, 0);
}

export function calculateTotalExpenses(expenses: LocalExpense[]): number {
  return expenses.reduce((sum, e) => sum + e.amount, 0);
}

export function calculateNonCashExpenses(expenses: LocalExpense[]): number {
  return expenses
    .filter(e => e.paymentSource !== 'Cash')
    .reduce((sum, e) => sum + e.amount, 0);
}

export function calculateTotalHandovers(handovers: LocalCashHandover[]): number {
  return handovers.reduce((sum, h) => sum + h.amount, 0);
}

// ADVANCE CALCULATIONS
export function calculateTotalAdvances(advances: any[]): number {
  return advances.reduce((sum, a) => sum + a.amount, 0);
}

export function calculateRecoveredAdvances(advances: any[]): number {
  return advances.reduce((sum, a) => sum + a.recoveredAmount, 0);
}

export function calculateOutstandingAdvances(advances: any[]): number {
  return advances.reduce((sum, a) => sum + a.outstandingAmount, 0);
}

// Ledger entry for chronological display
export interface LedgerEntry {
  id: string;
  date: string;
  timestamp: number;
  type: 'Opening' | 'Cash Ride' | 'Expense' | 'Handover' | 'Adjustment';
  description: string;
  amount: number;
  isPositive: boolean;
  runningBalance: number;
}

export function generateLedger(
  rides: LocalRide[],
  expenses: LocalExpense[],
  handovers: LocalCashHandover[]
): LedgerEntry[] {
  let entries: Omit<LedgerEntry, 'runningBalance'>[] = [];

  // Add initial opening cash (using an old date to put it first)
  entries.push({
    id: 'opening-cash',
    date: '2026-01-01',
    timestamp: 0,
    type: 'Opening',
    description: 'Opening Cash',
    amount: INITIAL_OPENING_CASH,
    isPositive: true,
  });

  rides.filter(r => r.revenueType === 'CASH').forEach(r => {
    entries.push({
      id: r.id,
      date: r.date,
      timestamp: r.createdAt,
      type: 'Cash Ride',
      description: 'Cash Ride',
      amount: r.amount,
      isPositive: true,
    });
  });

  expenses.filter(e => e.paymentSource === 'Cash').forEach(e => {
    entries.push({
      id: e.id,
      date: e.date,
      timestamp: e.createdAt,
      type: 'Expense',
      description: e.category,
      amount: e.amount,
      isPositive: false,
    });
  });

  handovers.forEach(h => {
    entries.push({
      id: h.id,
      date: h.date,
      timestamp: h.createdAt,
      type: 'Handover',
      description: `Handed to ${h.handedTo}`,
      amount: h.amount,
      isPositive: false,
    });
  });

  // Sort by timestamp
  entries.sort((a, b) => a.timestamp - b.timestamp);

  // Calculate running balance
  let currentBalance = 0;
  return entries.map(entry => {
    if (entry.isPositive) {
      currentBalance += entry.amount;
    } else {
      currentBalance -= entry.amount;
    }
    return {
      ...entry,
      runningBalance: currentBalance,
    };
  });
}
