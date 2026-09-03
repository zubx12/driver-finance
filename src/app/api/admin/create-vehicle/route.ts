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
        status: 'Active'
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