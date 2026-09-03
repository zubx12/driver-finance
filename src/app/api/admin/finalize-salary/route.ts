import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabaseAuth = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => cookieStore.getAll(),
          setAll: (cookiesToSet) => {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          },
        },
      }
    );
    const { data: { user } } = await supabaseAuth.auth.getUser();
    if (!user || user.user_metadata?.role !== 'admin') {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 403 });
    }

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

    // 3. For each share, generate settlements
    // The shares table has partner_id directly (from initial schema)
    if (shares && shares.length > 0) {
      for (const share of shares) {
        if (!share.partner_id) continue;

        // Insert settlement using partner_id directly from the share
        await supabase.from('settlements').insert({
          share_id: share.id,
          partner_id: share.partner_id,
          amount: share.share_amount,
          status: 'pending'
        });
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