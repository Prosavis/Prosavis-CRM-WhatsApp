import { describe, expect, it } from 'vitest';
import {
  POST_SERVICE_CAMPAIGN_TYPE,
  POST_SERVICE_TEMPLATE_LANGUAGE,
  POST_SERVICE_TEMPLATE_NAME,
  buildPostServiceMessageBody,
  buildPostServiceTemplateComponents,
} from '../../supabase/functions/_shared/postServiceAutomation';

describe('post-service WhatsApp automation', () => {
  it('keeps the approved template identifiers and exact message copy', () => {
    expect(POST_SERVICE_TEMPLATE_NAME).toBe('service_finalizado');
    expect(POST_SERVICE_TEMPLATE_LANGUAGE).toBe('es_CO');
    expect(POST_SERVICE_CAMPAIGN_TYPE).toBe('POST_SERVICIO');
    expect(buildPostServiceMessageBody('María', '22 de julio de 2026')).toBe(
      'Hola María, tu servicio de limpieza del 22 de julio de 2026 ha finalizado. Gracias por confiar en Prosavis.\n\n¿Cómo te fue? Cuéntanos por este chat. Si quieres reagendar, responde con el día que necesitas y revisamos disponibilidad.',
    );
  });

  it('builds the approved positional template components for name and date', () => {
    expect(
      buildPostServiceTemplateComponents('María', '22 de julio de 2026'),
    ).toEqual([
      {
        type: 'body',
        parameters: [
          { type: 'text', text: 'María' },
          {
            type: 'text',
            text: '22 de julio de 2026',
          },
        ],
      },
    ]);
  });
});
