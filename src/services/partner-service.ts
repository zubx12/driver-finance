import { 
  Partner, 
  PartnerVehicle, 
  OwnershipArrangement, 
  Settlement, 
  Driver,
        } from '../types/partner';

// Import real data layer functions
import { getPartnerVehicles as getDbPartnerVehicles, getVehiclePartners } from '@/lib/data/vehicles';
import { getCalculationsForVehicle } from '@/lib/data/salaryCalculations';
import { getCurrentPartner } from '@/lib/data/partners';
import { getAdminDrivers } from '@/lib/data/drivers';
import { getVehicleExpenses } from '@/lib/data/expenses';
import { getVehiclePeriodFinancials } from '@/lib/data/dailySummary';

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
    const dbPartner = await getCurrentPartner();
    if (!dbPartner) throw new Error("Partner not found or not authenticated");
    
    return {
      id: dbPartner.id,
      name: dbPartner.name,
      joinedDate: dbPartner.joined_date,
      status: dbPartner.status as 'Active' | 'Inactive',
    };
  },

  async getPartnerVehicles(partnerId: string): Promise<PartnerVehicle[]> {
    const vehicles = await getDbPartnerVehicles(partnerId);
    return vehicles.map(v => ({
      id: v.id,
      make: v.make,
      model: v.model,
      year: v.year,
      plateNumber: v.plate_number,           // PartnerVehicle expects plateNumber
      status: v.status as 'Active' | 'Maintenance' | 'Inactive',
    }));
  },

  async getOwnership(partnerId: string, vehicleId: string): Promise<OwnershipArrangement | null> {
    const splits = await getVehiclePartners(vehicleId);
    const mySplit = splits.find(s => s.partner_id === partnerId);
    if (!mySplit) return null;

    return {
      id: mySplit.id,
      vehicleId: mySplit.vehicle_id,
      partnerId: mySplit.partner_id,
      percentage: mySplit.percentage,
      effectiveFrom: mySplit.effective_from,   // OwnershipArrangement expects effectiveFrom
      effectiveTo: mySplit.effective_to ?? null,
      status: mySplit.effective_to ? 'Ended' : 'Active',  // 'Ended' not 'Inactive'
    };
  },

  async getVehiclePartners(vehicleId: string): Promise<OwnershipArrangement[]> {
    const splits = await getVehiclePartners(vehicleId);
    return splits.map(s => ({
      id: s.id,
      vehicleId: s.vehicle_id,
      partnerId: s.partner_id,
      percentage: s.percentage,
      effectiveFrom: s.effective_from,
      effectiveTo: s.effective_to ?? null,
      status: s.effective_to ? 'Ended' : 'Active' as 'Active' | 'Ended',
    }));
  },


  async getSettlements(partnerId: string): Promise<Settlement[]> {
    // We would need a dedicated query for partner settlements, but for now we'll fetch all 
    // vehicles for this partner, then fetch calculations for those vehicles, and map them.
    // In a real scenario, we'd add a getSettlementsForPartner query to salaryCalculations.ts.
    return []; // TODO: Implement real settlement fetching for partner
  },

  async getAllDrivers(): Promise<Driver[]> {
    const drivers = await getAdminDrivers();
    return drivers.map(d => ({
      id: d.id,
      name: d.name,
      phone: d.phone,
      status: d.status
    }));
  },

  async getVehicleExpenses(vehicleId: string, period?: string): Promise<{ id: string; date: string; vehicleId: string; driverId: string; amount: number; category: string; paymentMethod: string; description?: string; receiptUrl?: string; driverName: string }[]> {
    // Parse period (e.g. "August 2026") to start/end dates
    let start = '2000-01-01';
    let end = '2100-12-31';
    
    if (period && period !== 'All') {
      const d = new Date(period + ' 1');
      if (!isNaN(d.getTime())) {
        start = new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0];
        end = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().split('T')[0];
      }
    }
    
    const expenses = await getVehicleExpenses(vehicleId, start, end);
    const drivers = await getAdminDrivers();
    
    return expenses.map(e => {
      const d = drivers.find(drv => drv.id === e.driver_id);
      return {
        id: e.id,
        date: e.expense_date,
        vehicleId: e.vehicle_id,
        driverId: e.driver_id,
        driverName: d?.name || 'Unknown Driver',
        amount: e.amount,
        category: e.category,
        paymentMethod: e.payment_method,
        description: e.description || '',
        status: 'Approved'
      };
    });
  },

  async logCashToDriver(vehicleId: string, driverId: string, amount: number, reason: string): Promise<void> {
    // This requires an adjustments/cash_handovers table which we noted was missing from Supabase migrations earlier.
    console.warn("logCashToDriver not implemented in DB layer yet");
  },

  // ------------------------------------------------------------------
  // NEW DYNAMIC CALCULATION ENGINE
  // ------------------------------------------------------------------
  
  // Helper to parse "Month YYYY" into start and end dates
  _parsePeriod(period: string): { start: string; end: string } {
    if (period === 'All') return { start: '2000-01-01', end: '2100-12-31' };
    const d = new Date(period + ' 1');
    if (isNaN(d.getTime())) return { start: '2000-01-01', end: '2100-12-31' };
    
    const start = new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0];
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().split('T')[0];
    return { start, end };
  },

  async getCalculatedFinancials(period: string, vehicleId?: string, driverId?: string): Promise<CalculatedFinancials> {
    const { start, end } = this._parsePeriod(period);
    
    // NOTE: This uses the daily_summary rollup table for blazing fast dashboards.
    // Right now it supports vehicleId filtering. If driverId filtering is strictly needed, 
    // we'd add it to getVehiclePeriodFinancials.
    
    if (!vehicleId) {
      throw new Error("vehicleId is required for real DB calculations currently");
    }
    
    const fins = await getVehiclePeriodFinancials(vehicleId, start, end);
    
    return {
      totalRevenue: fins.totalRevenue,
      cashRevenue: fins.cashRevenue,
      voucherRevenue: fins.voucherRevenue,
      totalExpenses: fins.totalExpenses,
      cashExpenses: fins.cashExpenses,
      netRevenue: fins.netRevenue,
      voucherCollected: 0, // Requires collections table
      voucherOutstanding: fins.voucherRevenue, // Assuming 0 collected for now
      cashHandedOver: 0, // Requires cash_handovers table
      driverCashOutstanding: fins.cashRevenue - fins.cashExpenses // Simplified without handovers/adjustments
    };
  },

  async getMoMFinancials(currentPeriod: string, vehicleId?: string): Promise<MoMFinancials> {
    const currD = new Date(currentPeriod + ' 1');
    let previousPeriod = currentPeriod;
    
    if (!isNaN(currD.getTime())) {
      const prevD = new Date(currD.getFullYear(), currD.getMonth() - 1, 1);
      previousPeriod = prevD.toLocaleString('default', { month: 'long', year: 'numeric' });
    }

    const calcDelta = (curr: number, prev: number) => {
      if (prev === 0) return curr > 0 ? 100 : 0;
      return ((curr - prev) / prev) * 100;
    };

    const empty = () => ({ totalRevenue: 0, cashRevenue: 0, voucherRevenue: 0, totalExpenses: 0, cashExpenses: 0, netRevenue: 0, voucherCollected: 0, voucherOutstanding: 0, cashHandedOver: 0, driverCashOutstanding: 0 });

    if (vehicleId) {
      const current = await this.getCalculatedFinancials(currentPeriod, vehicleId);
      const previous = await this.getCalculatedFinancials(previousPeriod, vehicleId);
      return {
        currentPeriod, previousPeriod, current, previous,
        deltas: {
          totalRevenuePct: calcDelta(current.totalRevenue, previous.totalRevenue),
          totalExpensesPct: calcDelta(current.totalExpenses, previous.totalExpenses),
          netRevenuePct: calcDelta(current.netRevenue, previous.netRevenue),
        }
      };
    }

    // Aggregate Mode
    try {
      const partner = await this.getCurrentPartner();
      const vehicles = await this.getPartnerVehicles(partner.id);
      
      const current = empty();
      const previous = empty();
      
      for (const v of vehicles) {
        const ownership = await this.getOwnership(partner.id, v.id);
        const pct = (ownership?.percentage || 0) / 100;
        
        const currFin = await this.getCalculatedFinancials(currentPeriod, v.id);
        const prevFin = await this.getCalculatedFinancials(previousPeriod, v.id);
        
        current.totalRevenue += currFin.totalRevenue * pct;
        current.cashRevenue += currFin.cashRevenue * pct;
        current.voucherRevenue += currFin.voucherRevenue * pct;
        current.totalExpenses += currFin.totalExpenses * pct;
        current.cashExpenses += currFin.cashExpenses * pct;
        current.netRevenue += currFin.netRevenue * pct;
        current.voucherCollected += currFin.voucherCollected * pct;
        current.voucherOutstanding += currFin.voucherOutstanding * pct;
        current.cashHandedOver += currFin.cashHandedOver * pct;
        current.driverCashOutstanding += currFin.driverCashOutstanding * pct;
        
        previous.totalRevenue += prevFin.totalRevenue * pct;
        previous.cashRevenue += prevFin.cashRevenue * pct;
        previous.voucherRevenue += prevFin.voucherRevenue * pct;
        previous.totalExpenses += prevFin.totalExpenses * pct;
        previous.cashExpenses += prevFin.cashExpenses * pct;
        previous.netRevenue += prevFin.netRevenue * pct;
        previous.voucherCollected += prevFin.voucherCollected * pct;
        previous.voucherOutstanding += prevFin.voucherOutstanding * pct;
        previous.cashHandedOver += prevFin.cashHandedOver * pct;
        previous.driverCashOutstanding += prevFin.driverCashOutstanding * pct;
      }
      
      return {
        currentPeriod, previousPeriod, current, previous,
        deltas: {
          totalRevenuePct: calcDelta(current.totalRevenue, previous.totalRevenue),
          totalExpensesPct: calcDelta(current.totalExpenses, previous.totalExpenses),
          netRevenuePct: calcDelta(current.netRevenue, previous.netRevenue),
        }
      };
    } catch (e) {
      return {
        currentPeriod, previousPeriod, current: empty(), previous: empty(),
        deltas: { totalRevenuePct: 0, totalExpensesPct: 0, netRevenuePct: 0 }
      };
    }
  }
};
