import { createClient } from '@supabase/supabase-js';

const url = import.meta.env['VITE_SUPABASE_URL'] ?? '';
const anon = import.meta.env['VITE_SUPABASE_ANON_KEY'] ?? '';

export const supabase = createClient(url, anon, {
  auth: { persistSession: true, storageKey: 'tn:auth' },
});

export const persistJwt = async () => {
  const { data } = await supabase.auth.getSession();
  if (data.session?.access_token) {
    sessionStorage.setItem('tn:jwt', data.session.access_token);
  } else {
    sessionStorage.removeItem('tn:jwt');
  }
};

supabase.auth.onAuthStateChange(() => {
  void persistJwt();
});
