import { createClient as createAdmin } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.user_metadata?.role !== 'admin') {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 403 });
  }

  const { vehicleId, splits, driverPayType, driverCommission, driverSalary, driverBonus } = await request.json();
  if (!vehicleId || !Array.isArray(splits)) {
    return NextResponse.json({ message: 'vehicleId and splits required' }, { status: 400 });
  }

  const admin = createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const today = new Date().toISOString().split('T')[0];

  // 1. Delete any vehicle_partners rows for this vehicle created EXACTLY today (prevents same-day duplicate key errors)
  await admin.from('vehicle_partners')
    .delete()
    .eq('vehicle_id', vehicleId)
    .eq('effective_from', today);

  // 2. Close existing active splits for this vehicle
  await admin.from('vehicle_partners')
    .update({ effective_to: today })
    .eq('vehicle_id', vehicleId)
    .is('effective_to', null);

  // 3. Insert new splits
  const rows = splits
    .filter((s: any) => s.partnerId && parseFloat(s.percentage) > 0)
    .map((s: any) => ({
      vehicle_id: vehicleId,
      partner_id: s.partnerId,
      percentage: parseFloat(s.percentage),
      effective_from: today,
      effective_to: null,
    }));

  if (rows.length > 0) {
    const { error } = await admin.from('vehicle_partners').insert(rows);
    if (error) return NextResponse.json({ message: error.message }, { status: 500 });
  }

  // Setup driver compensation
  if (driverPayType) {
    // Find the currently assigned driver
    const { data: driverData, error: driverErr } = await admin
      .from('drivers')
      .select('id')
      .eq('vehicle_id', vehicleId)
      .eq('status', 'Active')
      .single();

    if (driverErr && driverErr.code !== 'PGRST116') {
      return NextResponse.json({ message: driverErr.message }, { status: 500 });
    }

    if (driverData) {
      // Delete any compensation records created TODAY
      await admin.from('driver_compensation')
        .delete()
        .eq('vehicle_id', vehicleId)
        .eq('driver_id', driverData.id)
        .eq('effective_from', today);

      // Close existing active compensation for this driver/vehicle
      await admin.from('driver_compensation')
        .update({ effective_to: today })
        .eq('vehicle_id', vehicleId)
        .eq('driver_id', driverData.id)
        .is('effective_to', null);

      // Insert new compensation record using correct column schema
      const { error: compErr } = await admin.from('driver_compensation').insert({
        driver_id: driverData.id,
        vehicle_id: vehicleId,
        compensation_type: driverPayType,
        commission_percentage: driverPayType === 'commission' ? parseFloat(driverCommission) : null,
        fixed_salary_amount: driverPayType === 'fixed_salary' ? parseFloat(driverSalary) : null,
        bonus_rate: parseFloat(driverBonus ?? '0') || 0,
        effective_from: today,
      });

      if (compErr) return NextResponse.json({ message: compErr.message }, { status: 500 });
    }
  }

  return NextResponse.json({ success: true });
}
