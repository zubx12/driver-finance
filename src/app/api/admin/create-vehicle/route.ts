import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { make, model, year, plate_number } = body;

    if (!make || !model || !year || !plate_number) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data, error } = await supabase
      .from('vehicles')
      .insert({
        make,
        model,
        year: parseInt(year, 10),
        plate_number,
        status: 'active'
      })
      .select('id')
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, vehicleId: data.id });
  } catch (error: any) {
    console.error('Create vehicle error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}