import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAppRole } from '@/lib/auth/roles';
import { rpcErrorResponse } from '@/lib/supabase/rpc-error';

interface SplitInput { partnerId?: string; percentage?: string | number }

/**
 * Save a vehicle's ownership splits and (optionally) its driver's pay terms.
 * set_vehicle_setup validates and saves both in one transaction; the database
 * also enforces the 100% rule. Unchanged terms are left untouched.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || getAppRole(user) !== 'admin') {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 403 });
  }

  const { vehicleId, splits, driverPayType, driverCommission, driverSalary, driverBonus } = await request.json();
  if (!vehicleId || !Array.isArray(splits)) {
    return NextResponse.json({ message: 'vehicleId and splits required' }, { status: 400 });
  }

  const pSplits = (splits as SplitInput[]).map((s) => ({
    partner_id: s.partnerId || null,
    percentage: Number(s.percentage),
  }));

  const pDriverPay = driverPayType
    ? {
        compensation_type: driverPayType,
        commission_percentage: driverPayType === 'commission' ? driverCommission : null,
        fixed_salary_amount: driverPayType === 'fixed_salary' ? driverSalary : null,
        bonus_rate: driverBonus ?? 0,
      }
    : null;

  const { error } = await supabase.rpc('set_vehicle_setup', {
    p_vehicle_id: vehicleId,
    p_splits: pSplits,
    p_driver_pay: pDriverPay,
  });
  if (error) return rpcErrorResponse(error);

  return NextResponse.json({ success: true });
}
