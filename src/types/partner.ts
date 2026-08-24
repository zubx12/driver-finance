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

