import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export function getServiceClient() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.');
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export async function requireCrmAdmin(req: Request) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    throw new Response('Usuario no autenticado.', { status: 401 });
  }

  const supabase = getServiceClient();
  const token = authHeader.replace('Bearer ', '');
  const { data: userData, error: userError } = await supabase.auth.getUser(token);

  if (userError || !userData.user) {
    throw new Response('Usuario no autenticado.', { status: 401 });
  }

  const { data: profile, error: profileError } = await supabase
    .from('admin_profiles')
    .select('id,email,role,is_active')
    .eq('id', userData.user.id)
    .eq('is_active', true)
    .single();

  if (profileError || !profile || !['admin', 'super_admin'].includes(profile.role)) {
    throw new Response('Usuario sin permisos CRM.', { status: 403 });
  }

  return { supabase, user: userData.user, profile };
}
