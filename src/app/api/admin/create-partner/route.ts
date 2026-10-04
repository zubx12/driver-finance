import { riyadhToday } from '@/lib/dates';
import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getAppRole } from '@/lib/auth/roles';

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
  if (!user || getAppRole(user) !== 'admin') {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 403 });
  }

  const { name, username, password, status = 'Active', existingDriverId } = await request.json();

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  if (existingDriverId) {
    // Promote existing driver to partner
    const { data: driver, error: drvErr } = await adminClient
      .from('drivers')
      .select('name, linked_auth_id, username')
      .eq('id', existingDriverId)
      .single();
    
    if (drvErr || !driver) {
      return NextResponse.json({ message: 'Driver not found' }, { status: 404 });
    }

    const { data: existingPartner } = await adminClient
      .from('partners')
      .select('id')
      .eq('linked_auth_id', driver.linked_auth_id)
      .maybeSingle();
    if (existingPartner) {
      return NextResponse.json({ message: 'This driver is already a partner' }, { status: 409 });
    }

    const { data: partnerData, error: partnerErr } = await adminClient
      .from('partners')
      .insert({
        name: driver.name,
        username: driver.username,
        linked_auth_id: driver.linked_auth_id,
        status: 'Active',
      })
      .select('id')
      .single();

    if (partnerErr) {
      return NextResponse.json({ message: partnerErr.message }, { status: 500 });
    }

    // D6: the account keeps its driver role and gains the partner role, so the
    // person can use both portals. Roles live in app_metadata (service-role only).
    const { data: authUser } = await adminClient.auth.admin.getUserById(driver.linked_auth_id);
    const appMetadata = authUser?.user?.app_metadata ?? {};
    const roles = new Set<string>(Array.isArray(appMetadata.roles) ? appMetadata.roles : []);
    roles.add('driver');
    roles.add('partner');

    const { error: roleErr } = await adminClient.auth.admin.updateUserById(driver.linked_auth_id, {
      app_metadata: { ...appMetadata, role: appMetadata.role ?? 'driver', roles: [...roles] },
    });
    if (roleErr) {
      // Undo the partner row so the promotion can simply be retried.
      await adminClient.from('partners').delete().eq('id', partnerData.id);
      return NextResponse.json({ message: roleErr.message }, { status: 500 });
    }

    return NextResponse.json({ partnerId: partnerData.id }, { status: 201 });
  }

  if (!name || !username || !password) {
    return NextResponse.json(
      { message: 'name, username, and password are required' },
      { status: 400 }
    );
  }

  if (password.length < 8) {
    return NextResponse.json({ message: 'Password must be at least 8 characters' }, { status: 400 });
  }
  if (!/\d/.test(password)) {
    return NextResponse.json({ message: 'Password must contain at least one number' }, { status: 400 });
  }

  const cleanUsername = username.trim().toLowerCase().replace(/\s+/g, '_');
  const email = cleanUsername + '@' + DOMAIN;

  const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { role: 'partner', roles: ['partner'] },
    user_metadata: { name, username: cleanUsername },
  });

  if (authError) {
    return NextResponse.json({ message: authError.message }, { status: 400 });
  }

  const { data: partnerData, error: dbError } = await adminClient
    .from('partners')
    .insert({
      name,
      username: cleanUsername,
      linked_auth_id: authData.user.id,
      status,
      joined_date: riyadhToday(),
    })
    .select('id')
    .single();

  if (dbError) {
    await adminClient.auth.admin.deleteUser(authData.user.id);
    return NextResponse.json({ message: dbError.message }, { status: 500 });
  }

  return NextResponse.json({ partnerId: partnerData.id }, { status: 201 });
}