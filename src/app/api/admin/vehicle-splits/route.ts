import { createClient as createAdmin } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.user_metadata?.role !== 'admin') {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 403 });
  }

  const { vehicleId, splits, driverPayType, driverCommission, driverSalary } = await request.json();
  if (!vehicleId || !Array.isArray(splits)) {
    return NextResponse.json({ message: 'vehicleId and splits required' }, { status: 400 });
  }

  const admin = createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Close existing active splits for this vehicle
  const now = new Date().toISOString();
  await admin.from('vehicle_partners')
    .update({ effective_to: now })
    .eq('vehicle_id', vehicleId)
    .is('effective_to', null);

  // Insert new splits
  const rows = splits
    .filter((s: any) => s.partnerId && parseFloat(s.percentage) > 0)
    .map((s: any) => ({
      vehicle_id: vehicleId,
      partner_id: s.partnerId,
      percentage: parseFloat(s.percentage),
      effective_from: now,
      effective_to: null,
    }));

  if (rows.length > 0) {
    const { error } = await admin.from('vehicle_partners').insert(rows);
    if (error) return NextResponse.json({ message: error.message }, { status: 500 });
  }

  // Upsert driver compensation
  if (driverPayType) {
    const { error } = await admin.from('driver_compensation').upsert({
      vehicle_id: vehicleId,
      pay_type: driverPayType,
      commission_rate: driverPayType === 'commission' ? parseFloat(driverCommission) : null,
      fixed_salary: driverPayType === 'fixed_salary' ? parseFloat(driverSalary) : null,
      effective_from: now,
    }, { onConflict: 'vehicle_id' });
    if (error) return NextResponse.json({ message: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}