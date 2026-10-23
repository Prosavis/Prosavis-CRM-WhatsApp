import { describe, expect, it } from 'vitest';
import type { WhatsAppTemplateSummary } from '@/services/whatsappService';
import {
  templateActionButtons,
  templateActionButtonsByName,
} from './whatsappTemplateHelpers';

const resenaAppComponents = [
  {
    type: 'BODY',
    text: 'Para la próxima limpieza puedes agendar en la app Prosavis.',
  },
  {
    type: 'BUTTONS',
    buttons: [
      { type: 'URL', text: 'Descargar app', url: 'https://prosavis.com/qr' },
      { type: 'URL', text: 'Dejar reseña', url: 'https://g.page/r/CQ1CXovHQpw0EAI/review' },
    ],
  },
];

describe('templateActionButtons', () => {
  it('lee los dos botones de url de resena_app', () => {
    expect(templateActionButtons(resenaAppComponents)).toEqual([
      { text: 'Descargar app', url: 'https://prosavis.com/qr' },
      { text: 'Dejar reseña', url: 'https://g.page/r/CQ1CXovHQpw0EAI/review' },
    ]);
  });

  it('deja teléfono y respuesta rápida como texto, y descarta una url que no es http', () => {
    expect(
      templateActionButtons([
        {
          type: 'BUTTONS',
          buttons: [
            { type: 'PHONE_NUMBER', text: 'Llamar', phone_number: '+573122531271' },
            { type: 'QUICK_REPLY', text: 'Sí' },
            { type: 'URL', text: 'Roto', url: '{{1}}' },
            { type: 'URL', text: '  ' },
          ],
        },
      ]),
    ).toEqual([{ text: 'Llamar' }, { text: 'Sí' }, { text: 'Roto' }]);
  });

  it('si hay dos idiomas, se queda con es_CO', () => {
    const es: WhatsAppTemplateSummary = {
      name: 'resena_app',
      language: 'es',
      status: 'APPROVED',
      components: [
        { type: 'BUTTONS', buttons: [{ type: 'URL', text: 'Otra', url: 'https://example.com' }] },
      ],
    };
    const esCo: WhatsAppTemplateSummary = {
      name: 'resena_app',
      language: 'es_CO',
      status: 'APPROVED',
      components: resenaAppComponents,
    };
    expect(templateActionButtonsByName([es, esCo]).get('resena_app')).toEqual([
      { text: 'Descargar app', url: 'https://prosavis.com/qr' },
      { text: 'Dejar reseña', url: 'https://g.page/r/CQ1CXovHQpw0EAI/review' },
    ]);
  });
});
