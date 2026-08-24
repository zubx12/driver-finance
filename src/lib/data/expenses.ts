import { createClient } from '@/lib/supabase/client';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DbExpense {
  id: string;
  driver_id: string;
  vehicle_id: string;
  amount: number;
  category: string;
  payment_method: 'Cash' | 'Card' | 'Transfer';
  description?: string;
  receipt_image_url: string; // NOT NULL in DB — always required
  expense_date: string; // YYYY-MM-DD
  created_at: string;
  updated_at: string;
}

export interface InsertExpensePayload {
  driver_id: string;
  vehicle_id: string;
  amount: number;
  category: string;
  payment_method: 'Cash' | 'Card' | 'Transfer';
  description?: string;
  receipt_image_url: string; // Must be uploaded to Storage first
  expense_date: string;
}

// ─── Receipt upload ───────────────────────────────────────────────────────────

/**
 * Upload a receipt image to Supabase Storage.
 * Returns the full path (used to generate signed URLs later).
 * Path format: {driverId}/{date}/{uuid}.jpg
 */
export async function uploadReceipt(
  driverId: string,
  date: string,
  file: File
): Promise<string> {
  const supabase = createClient();
  const ext = file.name.split('.').pop() ?? 'jpg';
  const path = `${driverId}/${date}/${crypto.randomUUID()}.${ext}`;

  const { error } = await supabase.storage
    .from('receipts')
    .upload(path, file, { upsert: false });

  if (error) throw new Error(`uploadReceipt: ${error.message}`);
  return path;
}

/**
 * Upload a receipt from a base64 string (used by offline sync worker).
 * Converts base64 → Blob → uploads to Storage.
 */
export async function uploadReceiptFromBase64(
  driverId: string,
  date: string,
  base64: string,
  mimeType: string = 'image/jpeg'
): Promise<string> {
  const byteString = atob(base64.split(',')[1] ?? base64);
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
  const blob = new Blob([ab], { type: mimeType });
  const file = new File([blob], 'receipt.jpg', { type: mimeType });
  return uploadReceipt(driverId, date, file);
}

/**
 * Get a short-lived signed URL for displaying a receipt image.
 * Never expose the storage path directly in the UI — always use signed URLs.
 */
export async function getReceiptSignedUrl(path: string, expiresInSeconds = 3600): Promise<string> {
  const supabase = createClient();
  const { data, error } = await supabase.storage
    .from('receipts')
    .createSignedUrl(path, expiresInSeconds);

  if (error) throw new Error(`getReceiptSignedUrl: ${error.message}`);
  return data.signedUrl;
}

// ─── Driver expense queries ───────────────────────────────────────────────────

/** Get all expenses for a driver within a date range. RLS scopes to own rows. */
export async function getDriverExpenses(
  driverId: string,
  start: string,
  end: string
): Promise<DbExpense[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('expenses')
    .select('*')
    .eq('driver_id', driverId)
    .gte('expense_date', start)
    .lte('expense_date', end)
    .order('expense_date', { ascending: false });

  if (error) throw new Error(`getDriverExpenses: ${error.message}`);
  return data ?? [];
}

/** Get today's expenses for the "My Day" view. */
export async function getDriverTodayExpenses(driverId: string): Promise<DbExpense[]> {
  const today = new Date().toISOString().split('T')[0];
  return getDriverExpenses(driverId, today, today);
}

/**
 * Insert a new expense.
 * Receipt must already be uploaded to Storage before calling this.
 * The DB NOT NULL constraint on receipt_image_url enforces this.
 */
export async function insertExpense(payload: InsertExpensePayload): Promise<DbExpense> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('expenses')
    .insert(payload)
    .select()
    .single();

  if (error) throw new Error(`insertExpense: ${error.message}`);
  return data;
}

/** Update an expense. RLS blocks updates to any expense that isn't today's. */
export async function updateExpense(
  id: string,
  updates: Partial<Pick<DbExpense, 'amount' | 'category' | 'description' | 'payment_method'>>
): Promise<DbExpense> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('expenses')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(`updateExpense: ${error.message}`);
  return data;
}

// ─── Admin/Partner expense queries ────────────────────────────────────────────

/** Get all expenses for a vehicle within a period. Used by admin and partner dashboards. */
export async function getVehicleExpenses(
  vehicleId: string,
  start: string,
  end: string
): Promise<DbExpense[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('expenses')
    .select('*')
    .eq('vehicle_id', vehicleId)
    .gte('expense_date', start)
    .lte('expense_date', end)
    .order('expense_date', { ascending: false });

  if (error) throw new Error(`getVehicleExpenses: ${error.message}`);
  return data ?? [];
}
