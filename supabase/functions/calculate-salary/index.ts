import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

interface CalculationRequest {
  vehicle_id: string;
  period_start: string; // YYYY-MM-DD
  period_end: string;   // YYYY-MM-DD
}

interface DriverCompensation {
  id: string;
  driver_id: string;
  compensation_type: 'commission' | 'fixed_salary';
  commission_percentage: number | null;
  fixed_salary_amount: number | null;
  bonus_rate: number;
}

interface DriverPayResult {
  driver_id: string;
  driver_compensation_id: string;
  compensation_type: string;
  commission_percentage: number | null;
  fixed_salary_amount: number | null;
  bonus_rate: number;
  driver_pay_amount: number;
}

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const body: CalculationRequest = await req.json();
    const { vehicle_id, period_start, period_end } = body;

    if (!vehicle_id || !period_start || !period_end) {
      return new Response(
        JSON.stringify({ error: 'vehicle_id, period_start, and period_end are required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Use service-role client — this function runs server-side
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // ── Step 1: Aggregate financials from daily_summary (fast rollup query) ──
    const { data: summaryRows, error: summaryError } = await supabase
      .from('daily_summary')
      .select('total_revenue, total_expenses, net_revenue')
      .eq('vehicle_id', vehicle_id)
      .gte('summary_date', period_start)
      .lte('summary_date', period_end);

    if (summaryError) throw summaryError;

    const totalRevenue = summaryRows?.reduce((s: number, r: any) => s + r.total_revenue, 0) ?? 0;
    const driverExpenses = summaryRows?.reduce((s: number, r: any) => s + r.total_expenses, 0) ?? 0;

    // ── Step 2: Get active ownership splits for this vehicle ──
    const { data: splits, error: splitsError } = await supabase
      .from('vehicle_partners')
      .select('id, partner_id, percentage')
      .eq('vehicle_id', vehicle_id)
      .lte('effective_from', period_start)
      .or(`effective_to.is.null,effective_to.gte.${period_end}`);

    if (splitsError) throw splitsError;
    if (!splits || splits.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No active ownership splits found for this vehicle in the given period.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Validate splits sum to 100
    const totalPct = splits.reduce((s: number, sp: any) => s + sp.percentage, 0);
    if (Math.abs(totalPct - 100) > 0.1) {
      return new Response(
        JSON.stringify({ error: `Ownership percentages sum to ${totalPct}, not 100. Fix splits before running calculation.` }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // ── Step 3: Get active driver compensation for this vehicle ──
    // Drivers may have compensation linked to this specific vehicle or to any vehicle (vehicle_id IS NULL)
    const { data: driverCompRows, error: driverCompError } = await supabase
      .from('driver_compensation')
      .select('id, driver_id, compensation_type, commission_percentage, fixed_salary_amount, bonus_rate')
      .or(`vehicle_id.eq.${vehicle_id},vehicle_id.is.null`)
      .lte('effective_from', period_start)
      .or(`effective_to.is.null,effective_to.gte.${period_end}`);

    if (driverCompError) throw driverCompError;

    // ── Step 4: Check for existing calculation (draft/finalized) ──
    const { data: existingCalc } = await supabase
      .from('salary_calculations')
      .select('id, status, company_expenses')
      .eq('vehicle_id', vehicle_id)
      .eq('period_start', period_start)
      .eq('period_end', period_end)
      .single();

    if (existingCalc?.status === 'finalized') {
      return new Response(
        JSON.stringify({ error: 'A finalized calculation already exists for this period. Cannot recalculate.' }),
        { status: 409, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Company expenses (set by admin on draft) are added to total expenses
    const companyExpenses: number = existingCalc?.company_expenses ?? 0;
    const totalExpenses = driverExpenses + companyExpenses;
    const netRevenue = totalRevenue - totalExpenses;

    // ── Step 5: Calculate driver pay ──
    // Business rule: driver pay is deducted from net BEFORE partner equity split
    // net_revenue already includes company deductions
    let totalDriverPay = 0;
    const driverPayResults: DriverPayResult[] = [];

    for (const comp of (driverCompRows ?? []) as DriverCompensation[]) {
      let payAmount = 0;

      if (comp.compensation_type === 'commission') {
        // Commission = percentage of net revenue (already includes company expenses)
        const pct = comp.commission_percentage ?? 0;
        payAmount = Math.round((netRevenue * (pct / 100)) * 100) / 100;
      } else if (comp.compensation_type === 'fixed_salary') {
        // Fixed salary is a flat amount, independent of revenue
        // Bonus = percentage of net revenue (company expenses already deducted)
        const salary = comp.fixed_salary_amount ?? 0;
        const bonusPct = comp.bonus_rate ?? 0;
        const bonus = bonusPct > 0 && netRevenue > 0
          ? Math.round((netRevenue * (bonusPct / 100)) * 100) / 100
          : 0;
        payAmount = salary + bonus;
      }

      if (payAmount > 0) {
        totalDriverPay += payAmount;
        driverPayResults.push({
          driver_id: comp.driver_id,
          driver_compensation_id: comp.id,
          compensation_type: comp.compensation_type,
          commission_percentage: comp.commission_percentage,
          fixed_salary_amount: comp.fixed_salary_amount,
          bonus_rate: comp.bonus_rate,
          driver_pay_amount: payAmount,
        });
      }
    }

    // ── Step 6: Calculate remaining net for partner split ──
    // Commission/salary is deducted first, then partners split the remainder
    const remainingNet = netRevenue - totalDriverPay;

    // ── Step 7: Upsert the salary_calculations row ──
    let calcId: string;

    if (existingCalc?.id) {
      // Update existing draft
      const { error } = await supabase
        .from('salary_calculations')
        .update({
          total_revenue: totalRevenue,
          total_expenses: totalExpenses,
          net_revenue: netRevenue,
          driver_pay_total: totalDriverPay,
        })
        .eq('id', existingCalc.id);
      if (error) throw error;
      calcId = existingCalc.id;

      // Delete old shares and driver pay so we can re-insert
      await supabase.from('salary_calculation_shares').delete().eq('calculation_id', calcId);
      await supabase.from('driver_pay_calculations').delete().eq('calculation_id', calcId);
    } else {
      // Insert new draft
      const { data: newCalc, error } = await supabase
        .from('salary_calculations')
        .insert({
          period_start,
          period_end,
          vehicle_id,
          total_revenue: totalRevenue,
          total_expenses: totalExpenses,
          net_revenue: netRevenue,
          driver_pay_total: totalDriverPay,
          status: 'draft',
        })
        .select('id')
        .single();
      if (error) throw error;
      calcId = newCalc.id;
    }

    // ── Step 8: Insert each partner's share (from remainingNet, not full netRevenue) ──
    const shareRows = splits.map((split: any) => ({
      calculation_id: calcId,
      partner_id: split.partner_id,
      ownership_percentage: split.percentage,
      share_amount: Math.round((remainingNet * (split.percentage / 100)) * 100) / 100,
    }));

    const { error: sharesError } = await supabase
      .from('salary_calculation_shares')
      .insert(shareRows);
    if (sharesError) throw sharesError;

    // ── Step 9: Insert driver pay calculation rows ──
    if (driverPayResults.length > 0) {
      const driverPayRows = driverPayResults.map((dp) => ({
        calculation_id: calcId,
        driver_id: dp.driver_id,
        driver_compensation_id: dp.driver_compensation_id,
        compensation_type: dp.compensation_type,
        commission_percentage: dp.commission_percentage,
        fixed_salary_amount: dp.fixed_salary_amount,
        bonus_rate: dp.bonus_rate,
        driver_pay_amount: dp.driver_pay_amount,
      }));

      const { error: driverPayError } = await supabase
        .from('driver_pay_calculations')
        .insert(driverPayRows);
      if (driverPayError) throw driverPayError;
    }

    return new Response(
      JSON.stringify({
        calculationId: calcId,
        summary: {
          period_start,
          period_end,
          vehicle_id,
          total_revenue: totalRevenue,
          total_expenses: totalExpenses,
          net_revenue: netRevenue,
          driver_pay_total: totalDriverPay,
          remaining_net_for_partners: remainingNet,
          driver_pay: driverPayResults.map(dp => ({
            driver_id: dp.driver_id,
            type: dp.compensation_type,
            amount: dp.driver_pay_amount,
          })),
          partner_shares: shareRows.map((s: any) => ({
            partner_id: s.partner_id,
            percentage: s.ownership_percentage,
            amount: s.share_amount,
          })),
        }
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('calculate-salary error:', err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
})
