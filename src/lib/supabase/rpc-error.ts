import { NextResponse } from 'next/server';
import type { PostgrestError } from '@supabase/supabase-js';

/**
 * Turns an error raised by a database function into an HTTP response.
 * The payout functions raise specific SQLSTATE codes with messages written
 * for admins, so the message is passed through unchanged.
 */
export function rpcErrorResponse(error: PostgrestError) {
  const status =
    error.code === '42501' ? 403 :
    error.code === 'P0002' ? 404 :
    error.code === '40001' || error.code === '23P01' ? 409 :
    error.code === '22023' || error.code === '23514' || error.code === '23503' ? 400 :
    500;
  return NextResponse.json({ message: error.message, code: error.code }, { status });
}
