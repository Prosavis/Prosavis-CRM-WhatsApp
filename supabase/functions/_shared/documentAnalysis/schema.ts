export const RESUME_EXTRACT_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'subjects', 'facts'],
  properties: {
    summary: { type: 'string' },
    subjects: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['fullName', 'confidence', 'evidence'],
        properties: {
          fullName: { type: 'string' },
          phone: { type: ['string', 'null'] },
          email: { type: ['string', 'null'] },
          documentNumber: { type: ['string', 'null'] },
          confidence: { type: 'number' },
          evidence: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    facts: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['key', 'value', 'evidence'],
        properties: {
          key: { type: 'string' },
          value: { type: 'string' },
          evidence: { type: 'string' },
          page: { type: ['number', 'null'] },
        },
      },
    },
  },
} as const;

export const LABOR_EXTRACT_SYSTEM = [
  'Eres un extractor documental para reclutamiento de auxiliares de limpieza en Colombia.',
  'Devuelve solo hechos visibles en el documento, audio o imagen.',
  'No inventes experiencia, cédula, barrio ni disponibilidad.',
  'Si hay varias personas, sepáralas en subjects distintos.',
  'Cada fact debe citar evidencia (página, frase o marca de tiempo).',
].join(' ');

export const LABOR_EXTRACT_PROMPT = [
  'Extrae todas las personas candidatas y los hechos laborales visibles.',
  'Prioriza: nombre, cédula, teléfono, correo, experiencia en aseo,',
  'disponibilidad, ubicación/desplazamiento, referencias y documentos adjuntos.',
  'No uses este material para cotizar un servicio de limpieza.',
].join(' ');
