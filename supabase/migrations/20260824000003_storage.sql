-- Migration: Supabase Storage bucket for receipt images
-- Private bucket — drivers upload, admin reads. No public URLs ever.

-- Create the private receipts bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'receipts',
    'receipts',
    false, -- Private: no public URLs
    10485760, -- 10MB limit per file
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic']
);

-- ==========================================
-- STORAGE RLS POLICIES
-- Path convention: receipts/{driver_id}/{date}/{uuid}.jpg
-- ==========================================

-- Drivers can upload to their own folder only
CREATE POLICY "Drivers can upload receipts to own folder" ON storage.objects
    FOR INSERT WITH CHECK (
        bucket_id = 'receipts'
        AND auth.uid() IS NOT NULL
        AND (storage.foldername(name))[1] IN (
            SELECT id::TEXT FROM public.drivers WHERE linked_auth_id = auth.uid()
        )
    );

-- Drivers can read their own receipts
CREATE POLICY "Drivers can read own receipts" ON storage.objects
    FOR SELECT USING (
        bucket_id = 'receipts'
        AND (storage.foldername(name))[1] IN (
            SELECT id::TEXT FROM public.drivers WHERE linked_auth_id = auth.uid()
        )
    );

-- Admin can read all receipts
CREATE POLICY "Admin can read all receipts" ON storage.objects
    FOR SELECT USING (
        bucket_id = 'receipts'
        AND auth.jwt() ->> 'role' = 'admin'
    );

-- Admin can delete receipts (e.g. for GDPR/data retention)
CREATE POLICY "Admin can delete receipts" ON storage.objects
    FOR DELETE USING (
        bucket_id = 'receipts'
        AND auth.jwt() ->> 'role' = 'admin'
    );
