import { createClient as createAdminClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  // Verify admin
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.user_metadata?.role !== 'admin') {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 403 });
  }

  const { periodStart, periodEnd } = await request.json();
  if (!periodStart || !periodEnd) {
    return NextResponse.json({ message: 'periodStart and periodEnd required' }, { status: 400 });
  }

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Get all active vehicles
  const { data: vehicles, error: vErr } = await admin.from('vehicles').select('id').eq('status', 'Active');
  if (vErr) return NextResponse.json({ message: vErr.message }, { status: 500 });

  const results = [];

  for (const vehicle of vehicles ?? []) {
    // Sum rides
    const { data: ridesData } = await admin
      .from('rides').select('amount').eq('vehicle_id', vehicle.id)
      .gte('ride_date', periodStart).lte('ride_date', periodEnd);
    const totalRevenue = (ridesData ?? []).reduce((s: number, r: any) => s + (r.amount ?? 0), 0);

    // Sum expenses
    const { data: expData } = await admin
      .from('expenses').select('amount').eq('vehicle_id', vehicle.id)
      .gte('expense_date', periodStart).lte('expense_date', periodEnd);
    const totalExpenses = (expData ?? []).reduce((s: number, e: any) => s + (e.amount ?? 0), 0);

    const netRevenue = totalRevenue - totalExpenses;

    // Upsert calculation (one per vehicle per period)
    const { data: calc, error: cErr } = await admin
      .from('salary_calculations')
      .upsert({
        vehicle_id: vehicle.id,
        period_start: periodStart,
        period_end: periodEnd,
        total_revenue: totalRevenue,
        total_expenses: totalExpenses,
        net_revenue: netRevenue,
        status: 'draft',
      }, { onConflict: 'vehicle_id,period_start' })
      .select('id').single();

    if (cErr || !calc) continue;

    // Get active partner splits for this vehicle
    const { data: splits } = await admin
      .from('vehicle_partners')
      .select('id, partner_id, percentage')
      .eq('vehicle_id', vehicle.id)
      .is('effective_to', null);

    // Delete old shares and re-insert
    await admin.from('salary_calculation_shares').delete().eq('calculation_id', calc.id);

    if (splits && splits.length > 0) {
      const shares = splits.map((s: any) => ({
        calculation_id: calc.id,
        vehicle_partner_id: s.id,
        ownership_percentage: s.percentage,
        share_amount: parseFloat(((netRevenue * s.percentage) / 100).toFixed(2)),
      }));
      await admin.from('salary_calculation_shares').insert(shares);
    }

    results.push({ vehicleId: vehicle.id, calcId: calc.id });
  }

  return NextResponse.json({ success: true, calculations: results.length }, { status: 200 });
}