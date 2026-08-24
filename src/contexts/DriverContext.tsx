'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { createClient } from '@/lib/supabase/client';

interface DriverProfile {
  driverId: string;
  driverName: string;
  username: string;
  status: string;
  vehicleId: string | null;
  vehicleMake: string;
  vehicleModel: string;
  vehiclePlate: string;
  payType: 'commission' | 'fixed_salary' | null;
  commissionRate: number | null;
  fixedSalary: number | null;
  bonusRate: number;
}

interface DriverContextValue extends DriverProfile {
  loading: boolean;
  reload: () => void;
}

const defaultProfile: DriverProfile = {
  driverId: '',
  driverName: '',
  username: '',
  status: 'Active',
  vehicleId: null,
  vehicleMake: '',
  vehicleModel: '',
  vehiclePlate: '',
  payType: null,
  commissionRate: null,
  fixedSalary: null,
  bonusRate: 0,
};

const DriverContext = createContext<DriverContextValue>({
  ...defaultProfile,
  loading: true,
  reload: () => {},
});

export function DriverProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<DriverProfile>(defaultProfile);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const supabase = createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    // Get driver record linked to this auth user
    const { data: driver } = await supabase
      .from('drivers')
      .select('id, name, username, status, vehicle_id')
      .eq('linked_auth_id', user.id)
      .single();

    if (!driver) { setLoading(false); return; }

    // Get vehicle info if assigned
    let vehicleMake = '', vehicleModel = '', vehiclePlate = '';
    if (driver.vehicle_id) {
      const { data: vehicle } = await supabase
        .from('vehicles')
        .select('make, model, plate_number')
        .eq('id', driver.vehicle_id)
        .single();
      if (vehicle) {
        vehicleMake = vehicle.make;
        vehicleModel = vehicle.model;
        vehiclePlate = vehicle.plate_number;
      }
    }

    // Get compensation model for this vehicle
    let payType: DriverProfile['payType'] = null;
    let commissionRate: number | null = null;
    let fixedSalary: number | null = null;
    let bonusRate = 0;

    if (driver.vehicle_id) {
      const { data: comp } = await supabase
        .from('driver_compensation')
        .select('pay_type, commission_rate, fixed_salary, bonus_rate')
        .eq('vehicle_id', driver.vehicle_id)
        .single();
      if (comp) {
        payType = comp.pay_type;
        commissionRate = comp.commission_rate;
        fixedSalary = comp.fixed_salary;
        bonusRate = comp.bonus_rate ?? 0;
      }
    }

    setProfile({
      driverId: driver.id,
      driverName: driver.name,
      username: driver.username ?? user.email?.split('@')[0] ?? '',
      status: driver.status,
      vehicleId: driver.vehicle_id,
      vehicleMake,
      vehicleModel,
      vehiclePlate,
      payType,
      commissionRate,
      fixedSalary,
      bonusRate,
    });
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  return (
    <DriverContext.Provider value={{ ...profile, loading, reload: load }}>
      {children}
    </DriverContext.Provider>
  );
}

export function useDriver() {
  return useContext(DriverContext);
}