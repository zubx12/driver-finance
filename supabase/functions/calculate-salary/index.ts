import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

interface CalculationRequest {
  vehicle_id: string;
  period_start: string; // YYYY-MM-DD
  period_end: string;   // YYYY-MM-DD
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

    const totalRevenue = summaryRows?.reduce((s, r) => s + r.total_revenue, 0) ?? 0;
    const totalExpenses = summaryRows?.reduce((s, r) => s + r.total_expenses, 0) ?? 0;
    const netRevenue = totalRevenue - totalExpenses;

    // ── Step 2: Get active ownership splits for this vehicle at period_start ──
    const { data: splits, error: splitsError } = await supabase
      .from('vehicle_partners')
      .select('partner_id, percentage')
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
    const totalPct = splits.reduce((s, sp) => s + sp.percentage, 0);
    if (Math.abs(totalPct - 100) > 0.1) {
      return new Response(
        JSON.stringify({ error: `Ownership percentages sum to ${totalPct}, not 100. Fix splits before running calculation.` }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // ── Step 3: Check if a draft calculation already exists for this period ──
    const { data: existingCalc } = await supabase
      .from('salary_calculations')
      .select('id, status')
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

    // ── Step 4: Upsert the salary_calculations row ──
    let calcId: string;

    if (existingCalc?.id) {
      // Update existing draft
      const { error } = await supabase
        .from('salary_calculations')
        .update({ total_revenue: totalRevenue, total_expenses: totalExpenses, net_revenue: netRevenue })
        .eq('id', existingCalc.id);
      if (error) throw error;
      calcId = existingCalc.id;

      // Delete old shares so we can re-insert
      await supabase.from('salary_calculation_shares').delete().eq('calculation_id', calcId);
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
          status: 'draft',
        })
        .select('id')
        .single();
      if (error) throw error;
      calcId = newCalc.id;
    }

    // ── Step 5: Calculate and insert each partner's share ──
    const shareRows = splits.map((split) => ({
      calculation_id: calcId,
      partner_id: split.partner_id,
      ownership_percentage: split.percentage,
      // Each partner's share = net_revenue × (their_percentage / 100)
      share_amount: Math.round((netRevenue * (split.percentage / 100)) * 100) / 100,
    }));

    const { error: sharesError } = await supabase
      .from('salary_calculation_shares')
      .insert(shareRows);
    if (sharesError) throw sharesError;

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
          partner_shares: shareRows.map(s => ({
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
