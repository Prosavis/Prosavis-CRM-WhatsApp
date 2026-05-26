import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { requireCrmAdmin } from '../_shared/supabase.ts';
import { formatError } from '../_shared/errors.ts';

const DEFAULT_SNIPPETS = [
  { shortcut: '/gracias', label: 'Agradecimiento', body: '¡Gracias por comunicarte con Prosavis! ¿Hay algo más en lo que te pueda ayudar?' },
  { shortcut: '/saludo', label: 'Saludo inicial', body: '¡Hola! 👋 Bienvenido/a a Prosavis. ¿En qué te puedo ayudar hoy?' },
  { shortcut: '/precios', label: 'Consulta de precios', body: 'Con gusto te comparto nuestros precios. ¿Cuántas horas de limpieza necesitas?' },
  { shortcut: '/app', label: 'Descarga la app', body: 'Puedes agendar tu servicio desde nuestra app "Prosavis", disponible en App Store y Google Play.' },
  { shortcut: '/espera', label: 'Solicitar espera', body: 'Dame un momento por favor, estoy verificando la información. 🙏' },
  { shortcut: '/despedida', label: 'Despedida', body: '¡Fue un gusto atenderte! Si necesitas algo más, escríbenos. ¡Que tengas un excelente día! 😊' },
];

async function seedDefaultSnippets(supabase: Awaited<ReturnType<typeof requireCrmAdmin>>['supabase']) {
  const rows = DEFAULT_SNIPPETS.map((snippet) => ({
    shortcut: snippet.shortcut,
    label: snippet.label,
    title: snippet.label,
    body: snippet.body,
    is_active: true,
  }));
  const { data, error } = await supabase.from('whatsapp_snippets').insert(rows).select('id,shortcut,label,body');
  if (error) throw error;
  return data ?? [];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { supabase } = await requireCrmAdmin(req);
    const { data, error } = await supabase
      .from('whatsapp_snippets')
      .select('id,shortcut,label,title,body')
      .eq('is_active', true)
      .order('shortcut', { ascending: true });

    if (error) throw error;

    if (!data?.length) {
      const seeded = await seedDefaultSnippets(supabase);
      return jsonResponse({
        snippets: seeded.map((row) => ({
          id: row.id,
          shortcut: row.shortcut,
          label: row.label,
          body: row.body,
        })),
      });
    }

    return jsonResponse({
      snippets: data.map((row) => ({
        id: row.id,
        shortcut: row.shortcut ?? row.title,
        label: row.label ?? row.title,
        body: row.body,
      })),
    });
  } catch (error) {
    if (error instanceof Response) return error;
    return jsonResponse({ error: formatError(error) }, 500);
  }
});
