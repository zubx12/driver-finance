export interface Driver {
  id: string;
  name: string;
  phone: string;
  status: 'Active' | 'Inactive';
  profilePhoto: string;
  joinedAt: string;
}

export interface Vehicle {
  id: string;
  make: string;
  model: string;
  year: number;
  plateNumber: string;
  type: string;
  status: 'Active' | 'Maintenance' | 'Inactive';
}

export interface DriverVehicleAssignment {
  driverId: string;
  vehicleId: string;
  isPrimary: boolean;
  assignedFrom: string;
  assignedTo: string | null;
  status: 'Active' | 'Ended';
}

export interface VehiclePartner {
  vehicleId: string;
  partnerId: string;
  partnerName: string;
  ownershipPercentage: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  status: 'Active' | 'Ended';
}

export interface DriverRevenueArrangement {
  driverId: string;
  vehicleId: string;
  percentage: number;
  calculationBasis: 'Net Revenue' | 'Gross Revenue';
  effectiveFrom: string;
  effectiveTo: string | null;
  status: 'Active' | 'Ended';
}

// MOCK DATA

export const MOCK_DRIVER: Driver = {
  id: 'DRV-001',
  name: 'Ahmed Hassan',
  phone: '+966 5X XXX XXXX',
  status: 'Active',
  profilePhoto: 'AH', // Using initials for avatar
  joinedAt: '2026-01-15'
};

export const MOCK_VEHICLES: Vehicle[] = [
  {
    id: 'VH-001',
    make: 'Toyota',
    model: 'Camry',
    year: 2024,
    plateNumber: 'ABC 1234',
    type: 'Sedan',
    status: 'Active'
  },
  {
    id: 'VH-002',
    make: 'Toyota',
    model: 'Staria',
    year: 2023,
    plateNumber: 'DEF 5678',
    type: 'Van',
    status: 'Maintenance'
  }
];

export const MOCK_ASSIGNMENTS: DriverVehicleAssignment[] = [
  {
    driverId: 'DRV-001',
    vehicleId: 'VH-001',
    isPrimary: true,
    assignedFrom: '2026-03-01',
    assignedTo: null,
    status: 'Active'
  },
  {
    driverId: 'DRV-001',
    vehicleId: 'VH-002',
    isPrimary: false,
    assignedFrom: '2026-01-01',
    assignedTo: '2026-02-28',
    status: 'Ended'
  }
];

export const MOCK_PARTNERS: VehiclePartner[] = [
  {
    vehicleId: 'VH-001',
    partnerId: 'PRT-101',
    partnerName: 'Mohammed Abdullah',
    ownershipPercentage: 35,
    effectiveFrom: '2026-01-01',
    effectiveTo: null,
    status: 'Active'
  },
  {
    vehicleId: 'VH-001',
    partnerId: 'PRT-102',
    partnerName: 'Khalid Ahmed',
    ownershipPercentage: 32.5,
    effectiveFrom: '2026-07-01',
    effectiveTo: null,
    status: 'Active'
  },
  {
    vehicleId: 'VH-001',
    partnerId: 'PRT-103',
    partnerName: 'Omar Hassan',
    ownershipPercentage: 32.5,
    effectiveFrom: '2026-07-01',
    effectiveTo: null,
    status: 'Active'
  }
];

export const MOCK_ARRANGEMENTS: DriverRevenueArrangement[] = [
  {
    driverId: 'DRV-001',
    vehicleId: 'VH-001',
    percentage: 35,
    calculationBasis: 'Net Revenue',
    effectiveFrom: '2026-08-01',
    effectiveTo: null,
    status: 'Active'
  },
  {
    driverId: 'DRV-001',
    vehicleId: 'VH-001',
    percentage: 30,
    calculationBasis: 'Net Revenue',
    effectiveFrom: '2026-03-01',
    effectiveTo: '2026-07-31',
    status: 'Ended'
  }
];

// Helper functions for easy access
export const getActiveVehicleForDriver = (driverId: string) => {
  const assignment = MOCK_ASSIGNMENTS.find(a => a.driverId === driverId && a.isPrimary && a.status === 'Active');
  return MOCK_VEHICLES.find(v => v.id === assignment?.vehicleId);
};

export const getActiveArrangementForDriver = (driverId: string, vehicleId: string) => {
  return MOCK_ARRANGEMENTS.find(a => a.driverId === driverId && a.vehicleId === vehicleId && a.status === 'Active');
};

export const getActivePartnersForVehicle = (vehicleId: string) => {
  return MOCK_PARTNERS.filter(p => p.vehicleId === vehicleId && p.status === 'Active');
};
