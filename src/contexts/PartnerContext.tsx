'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { createClient } from '@/lib/supabase/client';

interface PartnerProfile {
  partnerId: string;
  partnerName: string;
  username: string;
  status: string;
  joinedDate: string;
}

interface PartnerContextValue extends PartnerProfile {
  loading: boolean;
  reload: () => void;
}

const defaultProfile: PartnerProfile = {
  partnerId: '',
  partnerName: '',
  username: '',
  status: 'Active',
  joinedDate: '',
};

const PartnerContext = createContext<PartnerContextValue>({
  ...defaultProfile,
  loading: true,
  reload: () => {},
});

export function PartnerProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<PartnerProfile>(defaultProfile);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const { data: partner } = await supabase
      .from('partners')
      .select('id, name, username, status, joined_date')
      .eq('linked_auth_id', user.id)
      .single();

    if (!partner) { setLoading(false); return; }

    setProfile({
      partnerId: partner.id,
      partnerName: partner.name,
      username: partner.username ?? user.email?.split('@')[0] ?? '',
      status: partner.status,
      joinedDate: partner.joined_date ?? '',
    });
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  return (
    <PartnerContext.Provider value={{ ...profile, loading, reload: load }}>
      {children}
    </PartnerContext.Provider>
  );
}

export function usePartner() {
  return useContext(PartnerContext);
}