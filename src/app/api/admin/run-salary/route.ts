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
    // Rule #7: Never modify finalized calculations
    const { data: existing } = await admin
      .from('salary_calculations')
      .select('status')
      .eq('vehicle_id', vehicle.id)
      .eq('period_start', periodStart)
      .maybeSingle();

    if (existing?.status === 'finalized') {
      continue; // Skip — finalized calculations are historical record
    }

    // Sum rides
    const { data: ridesData } = await admin
      .from('rides').select('amount').eq('vehicle_id', vehicle.id)
      .gte('ride_date', periodStart).lte('ride_date', periodEnd);
    const totalRevenue = (ridesData ?? []).reduce((s: number, r: any) => s + (r.amount ?? 0), 0);

    // Sum expenses
    const { data: expData } = await admin
      .from('expenses').select('amount').eq('vehicle_id', vehicle.id)
      .gte('expense_date', periodStart).lte('expense_date', periodEnd);
    const driverExpenses = (expData ?? []).reduce((s: number, e: any) => s + (e.amount ?? 0), 0);

    // ── Driver Compensation ──
    // Query active driver compensation for this vehicle (or vehicle_id IS NULL = any vehicle)
    const { data: driverCompRows } = await admin
      .from('driver_compensation')
      .select('id, driver_id, compensation_type, commission_percentage, fixed_salary_amount, bonus_rate')
      .or(`vehicle_id.eq.${vehicle.id},vehicle_id.is.null`)
      .lte('effective_from', periodStart)
      .or(`effective_to.is.null,effective_to.gte.${periodEnd}`);

    // Read company_expenses from existing draft (admin sets this before re-running)
    const { data: existingDraft } = await admin
      .from('salary_calculations')
      .select('company_expenses')
      .eq('vehicle_id', vehicle.id)
      .eq('period_start', periodStart)
      .maybeSingle();

    // Company expenses are added to total expenses — net_revenue already reflects them
    const companyExpenses: number = existingDraft?.company_expenses ?? 0;
    const totalExpenses = driverExpenses + companyExpenses;
    const netRevenue = totalRevenue - totalExpenses;

    let totalDriverPay = 0;
    const driverPayItems: Array<{
      driver_id: string;
      driver_compensation_id: string;
      compensation_type: string;
      commission_percentage: number | null;
      fixed_salary_amount: number | null;
      bonus_rate: number;
      driver_pay_amount: number;
    }> = [];

    for (const comp of driverCompRows ?? []) {
      let payAmount = 0;

      if (comp.compensation_type === 'commission') {
        // Commission = percentage of net revenue (company expenses already included)
        const pct = comp.commission_percentage ?? 0;
        payAmount = parseFloat(((netRevenue * pct) / 100).toFixed(2));
      } else if (comp.compensation_type === 'fixed_salary') {
        // Fixed salary is flat; bonus = percentage of net revenue (company expenses already included)
        const salary = comp.fixed_salary_amount ?? 0;
        const bonusPct = comp.bonus_rate ?? 0;
        const bonus = bonusPct > 0 && netRevenue > 0
          ? parseFloat(((netRevenue * bonusPct) / 100).toFixed(2))
          : 0;
        payAmount = salary + bonus;
      }

      if (payAmount > 0) {
        totalDriverPay += payAmount;
        driverPayItems.push({
          driver_id: comp.driver_id,
          driver_compensation_id: comp.id,
          compensation_type: comp.compensation_type,
          commission_percentage: comp.commission_percentage,
          fixed_salary_amount: comp.fixed_salary_amount,
          bonus_rate: comp.bonus_rate ?? 0,
          driver_pay_amount: payAmount,
        });
      }
    }

    // Remaining net after driver pay is deducted
    const remainingNet = netRevenue - totalDriverPay;

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
        driver_pay_total: totalDriverPay,
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

    // Delete old shares and driver pay, then re-insert
    await admin.from('salary_calculation_shares').delete().eq('calculation_id', calc.id);
    await admin.from('driver_pay_calculations').delete().eq('calculation_id', calc.id);

    // Insert partner shares (using remainingNet, not full netRevenue)
    if (splits && splits.length > 0) {
      const shares = splits.map((s: any) => ({
        calculation_id: calc.id,
        partner_id: s.partner_id,
        ownership_percentage: s.percentage,
        share_amount: parseFloat(((remainingNet * s.percentage) / 100).toFixed(2)),
      }));
      await admin.from('salary_calculation_shares').insert(shares);
    }

    // Insert driver pay calculations
    if (driverPayItems.length > 0) {
      const driverPayRows = driverPayItems.map((dp) => ({
        calculation_id: calc.id,
        driver_id: dp.driver_id,
        driver_compensation_id: dp.driver_compensation_id,
        compensation_type: dp.compensation_type,
        commission_percentage: dp.commission_percentage,
        fixed_salary_amount: dp.fixed_salary_amount,
        bonus_rate: dp.bonus_rate,
        driver_pay_amount: dp.driver_pay_amount,
      }));
      await admin.from('driver_pay_calculations').insert(driverPayRows);
    }

    results.push({ vehicleId: vehicle.id, calcId: calc.id, driverPay: totalDriverPay });
  }

  return NextResponse.json({ success: true, calculations: results.length, results }, { status: 200 });
}