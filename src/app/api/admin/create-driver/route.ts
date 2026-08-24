import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

const DOMAIN = 'driverfinance.internal';

export async function POST(request: NextRequest) {
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

  const { name, username, password, status = 'Active', vehicleId } = await request.json();
  if (!name || !username || !password) {
    return NextResponse.json(
      { message: 'name, username, and password are required' },
      { status: 400 }
    );
  }

  const cleanUsername = username.trim().toLowerCase().replace(/\s+/g, '_');
  const email = cleanUsername + '@' + DOMAIN;

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { role: 'driver', name, username: cleanUsername },
  });

  if (authError) {
    return NextResponse.json({ message: authError.message }, { status: 400 });
  }

  const { data: driverData, error: dbError } = await adminClient
    .from('drivers')
    .insert({
      name,
      username: cleanUsername,
      linked_auth_id: authData.user.id,
      status,
      vehicle_id: vehicleId ?? null,
    })
    .select('id')
    .single();

  if (dbError) {
    await adminClient.auth.admin.deleteUser(authData.user.id);
    return NextResponse.json({ message: dbError.message }, { status: 500 });
  }

  return NextResponse.json({ driverId: driverData.id }, { status: 201 });
}