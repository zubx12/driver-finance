import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { settlementId, paymentReference, notes } = body;

    if (!settlementId || !paymentReference) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { error } = await supabase
      .from('settlements')
      .update({
        status: 'paid',
        paid_at: new Date().toISOString(),
        payment_reference: paymentReference,
        notes: notes || null
      })
      .eq('id', settlementId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Pay settlement error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}