import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { calcId } = body;

    if (!calcId) {
      return NextResponse.json({ error: 'Missing calcId' }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 1. Get the calculation
    const { data: calc, error: calcErr } = await supabase
      .from('salary_calculations')
      .select('*')
      .eq('id', calcId)
      .single();

    if (calcErr || !calc) throw new Error('Calculation not found');
    if (calc.status === 'finalized') throw new Error('Already finalized');

    // 2. Get the shares
    const { data: shares, error: sharesErr } = await supabase
      .from('salary_calculation_shares')
      .select('*')
      .eq('calculation_id', calcId);

    if (sharesErr) throw sharesErr;

    // 3. For each share, get the partner_id and generate settlements
    if (shares && shares.length > 0) {
      for (const share of shares) {
        if (!share.vehicle_partner_id) continue;
        
        // Get partner_id from vehicle_partners
        const { data: vp } = await supabase
          .from('vehicle_partners')
          .select('partner_id')
          .eq('id', share.vehicle_partner_id)
          .single();

        if (vp && vp.partner_id) {
          // Insert settlement
          await supabase.from('settlements').insert({
            share_id: share.id,
            partner_id: vp.partner_id,
            amount: share.share_amount,
            status: 'pending'
          });
        }
      }
    }

    // 4. Update calculation to finalized
    const { error: updateErr } = await supabase
      .from('salary_calculations')
      .update({ status: 'finalized' })
      .eq('id', calcId);

    if (updateErr) throw updateErr;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Finalize error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}