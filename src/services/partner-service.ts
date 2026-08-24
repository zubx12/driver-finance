import { 
  Partner, 
  PartnerVehicle, 
  OwnershipArrangement, 
  Settlement, 
  Driver,
  MockRide,
  MockExpense,
  CashHandover,
  VoucherCollection
} from '../types/partner';
import { 
  MOCK_LOGGED_IN_PARTNER, 
  MOCK_PARTNER_VEHICLES, 
  MOCK_OWNERSHIP, 
  MOCK_SETTLEMENTS,
  MOCK_RIDES,
  MOCK_EXPENSES,
  MOCK_HANDOVERS,
  MOCK_COLLECTIONS,
  MOCK_DRIVERS,
  MOCK_PAYERS,
  MOCK_ADJUSTMENTS
} from '../data/mock-partner-data';

// Simulate network latency (300ms)
const delay = (ms: number = 300) => new Promise(resolve => setTimeout(resolve, ms));

export interface CalculatedFinancials {
  totalRevenue: number;
  cashRevenue: number;
  voucherRevenue: number;
  totalExpenses: number;
  cashExpenses: number;
  netRevenue: number;
  voucherCollected: number;
  voucherOutstanding: number;
  cashHandedOver: number;
  driverCashOutstanding: number;
}

export interface MoMDeltas {
  totalRevenuePct: number;
  totalExpensesPct: number;
  netRevenuePct: number;
}

export interface MoMFinancials {
  currentPeriod: string;
  previousPeriod: string;
  current: CalculatedFinancials;
  previous: CalculatedFinancials;
  deltas: MoMDeltas;
}

export const partnerService = {
  async getCurrentPartner(): Promise<Partner> {
    await delay();
    return MOCK_LOGGED_IN_PARTNER;
  },

  async getPartnerVehicles(partnerId: string): Promise<PartnerVehicle[]> {
    await delay();
    return MOCK_PARTNER_VEHICLES;
  },

  async getOwnership(partnerId: string, vehicleId: string): Promise<OwnershipArrangement | null> {
    await delay();
    const ownership = MOCK_OWNERSHIP.find(o => o.partnerId === partnerId && o.vehicleId === vehicleId && o.status === 'Active');
    return ownership || null;
  },

  async getVehiclePartners(vehicleId: string): Promise<OwnershipArrangement[]> {
    await delay();
    return MOCK_OWNERSHIP.filter(o => o.vehicleId === vehicleId && o.status === 'Active');
  },

  async getSettlements(partnerId: string): Promise<Settlement[]> {
    await delay();
    return MOCK_SETTLEMENTS.filter(s => s.partnerId === partnerId);
  },

  async getAllDrivers(): Promise<Driver[]> {
    await delay(100);
    return MOCK_DRIVERS;
  },

  async getVehicleExpenses(vehicleId: string, period?: string): Promise<(MockExpense & { driverName: string })[]> {
    await delay();
    let expenses = MOCK_EXPENSES.filter(e => e.vehicleId === vehicleId);
    if (period) {
      expenses = expenses.filter(e => this._isDateInPeriod(e.date, period));
    }
    // Join driver names
    return expenses.map(e => {
      const d = MOCK_DRIVERS.find(drv => drv.id === e.driverId);
      return {
        ...e,
        driverName: d?.name || 'Unknown Driver'
      };
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  },

  async logCashToDriver(vehicleId: string, driverId: string, amount: number, reason: string): Promise<void> {
    await delay();
    MOCK_ADJUSTMENTS.push({
      id: `ADJ-${Date.now()}`,
      date: new Date().toISOString().split('T')[0], // Today
      vehicleId,
      driverId,
      amount, // Positive because the driver is receiving cash from partner, meaning driver owes company/partner more
      reason,
      status: 'Approved'
    });
  },

  // ------------------------------------------------------------------
  // NEW DYNAMIC CALCULATION ENGINE
  // ------------------------------------------------------------------
  
  // Internal helper to filter records by period
  _isDateInPeriod(dateStr: string, period: string) {
    if (period === 'All') return true;
    
    // Very basic mock parsing for "August 2026"
    const d = new Date(dateStr);
    const m = d.toLocaleString('default', { month: 'long' });
    const y = d.getFullYear();
    const formatted = `${m} ${y}`;
    
    if (period === 'August 2026') return formatted === 'August 2026';
    if (period === 'July 2026') return formatted === 'July 2026';
    if (period === 'Year 2026') return y === 2026;
    
    return true; // Fallback
  },

  async getCalculatedFinancials(period: string, vehicleId?: string, driverId?: string): Promise<CalculatedFinancials> {
    await delay();

    let rides = MOCK_RIDES.filter(r => this._isDateInPeriod(r.date, period));
    let expenses = MOCK_EXPENSES.filter(e => this._isDateInPeriod(e.date, period));
    let handovers = MOCK_HANDOVERS.filter(h => this._isDateInPeriod(h.date, period));
    let collections = MOCK_COLLECTIONS.filter(c => this._isDateInPeriod(c.date, period));
    let adjustments = MOCK_ADJUSTMENTS.filter(a => this._isDateInPeriod(a.date, period));

    if (vehicleId) {
      rides = rides.filter(r => r.vehicleId === vehicleId);
      expenses = expenses.filter(e => e.vehicleId === vehicleId);
      handovers = handovers.filter(h => h.vehicleId === vehicleId);
      adjustments = adjustments.filter(a => a.vehicleId === vehicleId);
    }

    if (driverId) {
      rides = rides.filter(r => r.driverId === driverId);
      expenses = expenses.filter(e => e.driverId === driverId);
      handovers = handovers.filter(h => h.driverId === driverId);
      adjustments = adjustments.filter(a => a.driverId === driverId);
    }

    let cashRevenue = 0;
    let voucherRevenue = 0;
    rides.forEach(r => {
      if (r.paymentMethod === 'Cash') cashRevenue += r.amount;
      else if (r.paymentMethod === 'Voucher') voucherRevenue += r.amount;
    });
    const totalRevenue = cashRevenue + voucherRevenue;

    let totalExpenses = 0;
    let cashExpenses = 0;
    expenses.forEach(e => {
      totalExpenses += e.amount;
      if (e.paymentMethod === 'Cash') cashExpenses += e.amount;
    });

    let cashHandedOver = 0;
    handovers.forEach(h => {
      cashHandedOver += h.amount;
    });

    let voucherCollected = 0;
    collections.forEach(c => {
      voucherCollected += c.amount;
    });
    
    let totalAdjustments = 0;
    adjustments.forEach(a => {
      totalAdjustments += a.amount;
    });

    const netRevenue = totalRevenue - totalExpenses;
    
    // Core formulas requested by user
    // Positive adjustment = driver owes more (e.g. they were given cash)
    const driverCashOutstanding = cashRevenue - cashExpenses - cashHandedOver + totalAdjustments;
    const voucherOutstanding = voucherRevenue - voucherCollected;

    return {
      totalRevenue,
      cashRevenue,
      voucherRevenue,
      totalExpenses,
      cashExpenses,
      netRevenue,
      voucherCollected,
      voucherOutstanding,
      cashHandedOver,
      driverCashOutstanding
    };
  },

  async getMoMFinancials(currentPeriod: string, vehicleId?: string): Promise<MoMFinancials> {
    // Basic mock logic to get previous month
    let previousPeriod = 'July 2026';
    if (currentPeriod === 'July 2026') previousPeriod = 'June 2026'; // fallback
    if (currentPeriod === 'August 2026') previousPeriod = 'July 2026';

    const current = await this.getCalculatedFinancials(currentPeriod, vehicleId);
    const previous = await this.getCalculatedFinancials(previousPeriod, vehicleId);

    const calcDelta = (curr: number, prev: number) => {
      if (prev === 0) return curr > 0 ? 100 : 0;
      return ((curr - prev) / prev) * 100;
    };

    return {
      currentPeriod,
      previousPeriod,
      current,
      previous,
      deltas: {
        totalRevenuePct: calcDelta(current.totalRevenue, previous.totalRevenue),
        totalExpensesPct: calcDelta(current.totalExpenses, previous.totalExpenses),
        netRevenuePct: calcDelta(current.netRevenue, previous.netRevenue),
      }
    };
  }
};
