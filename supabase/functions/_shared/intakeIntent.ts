import { quotesExistInBlock } from './reviewIntent.ts'

export type IntakeRoute = 'hogar' | 'empresas' | 'empleo'

export type IntakeRead = IntakeRoute | 'no_se_entiende'

export interface IntakeModelJudgment {
  intent: string
  evidence: string
  hasComplaint: boolean
}

const COMPLAINT = ['queja', 'pesimo', 'pesima', 'horrible', 'devolucion', 'estafa', 'no vuelvo']

export function normalizeIntakeSpaced(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function normalizeIntakeCompact(text: string): string {
  return normalizeIntakeSpaced(text).replace(/ /g, '')
}

function hasWord(spaced: string, word: string): boolean {
  return ` ${spaced} `.includes(` ${word} `)
}

export function intakeTextHasComplaint(text: string): boolean {
  const spaced = normalizeIntakeSpaced(text)
  return COMPLAINT.some((phrase) => spaced.includes(phrase))
}

function matches(spaced: string, compact: string): { empleo: boolean; hogar: boolean; empresas: boolean } {
  const empleo = compact.includes('buscoempleo')
    || compact.includes('buscoenpleo')
    || compact.includes('empleo')
    || hasWord(spaced, 'trabajo')
    || hasWord(spaced, 'vacante')
    || spaced.includes('hoja de vida')
  const hogar = spaced.includes('agendar una limpieza')
    || spaced.includes('quiero agendar')
    || hasWord(spaced, 'domestica')
    || hasWord(spaced, 'hogar')
    || (hasWord(spaced, 'limpieza') && !empleo)
  const empresas = hasWord(spaced, 'empresarial')
    || hasWord(spaced, 'oficina')
    || hasWord(spaced, 'local')
  return { empleo, hogar, empresas }
}

/** Texto libre. Vacío no es intención. Una sola rama es clara. Queja o dos ramas: no se entiende. */
export function intakeIntentFromText(body: string): IntakeRead | null {
  const spaced = normalizeIntakeSpaced(body)
  if (!spaced) return null
  if (spaced === '1' || spaced === 'domestica') return 'hogar'
  if (spaced === '2' || spaced === 'empresarial') return 'empresas'
  if (spaced === '3' || spaced === 'empleo') return 'empleo'
  if (intakeTextHasComplaint(body)) return 'no_se_entiende'
  const hit = matches(spaced, normalizeIntakeCompact(body))
  const count = Number(hit.empleo) + Number(hit.hogar) + Number(hit.empresas)
  if (count !== 1) return 'no_se_entiende'
  if (hit.empleo) return 'empleo'
  if (hit.hogar) return 'hogar'
  return 'empresas'
}

export function intakeRouteFromIntent(intent: IntakeRead | null): IntakeRoute | null {
  if (intent === 'hogar' || intent === 'empresas' || intent === 'empleo') return intent
  return null
}

const GENERIC = [
  'hola',
  'buenos dias',
  'buenas tardes',
  'buenas noches',
  'hey',
  'hi',
  'hello',
  'info',
  'informacion',
  'quiero informacion',
  'mas informacion',
  'quiero mas informacion',
  'hello can i get more info on this',
]

const AD_NAMES: Readonly<Record<string, string>> = {
  '120250397331720691': 'Glamping',
  '120250397333590691': 'Cerritos clara',
  '120250397337640691': 'Joven lujo',
  '120250397340930691': 'Señora',
}

export interface AdCue {
  sourceId: string
  headline: string
  body: string
}

const GENERIC_TOKENS = new Set([
  'hola',
  'buenos',
  'buen',
  'buenas',
  'dias',
  'tardes',
  'noches',
  'hey',
  'hi',
  'hello',
  'info',
  'informacion',
  'quiero',
  'mas',
  'una',
  'un',
])

export function isGenericIntake(body: string): boolean {
  const spaced = normalizeIntakeSpaced(body)
  if (!spaced) return true
  if (GENERIC.some((phrase) => spaced === phrase)) return true
  const tokens = spaced.split(' ')
  return tokens.length > 0 && tokens.every((token) => GENERIC_TOKENS.has(token))
}

/** El texto lista las tres opciones, aunque lo haya pegado una persona desde el CRM. */
export function outboundLooksLikeOptionMenu(body: string | null | undefined): boolean {
  const spaced = normalizeIntakeSpaced(body ?? '')
  return spaced.includes('domestica') && spaced.includes('empresarial') && spaced.includes('empleo')
}

export function adIntentFromCopy(copy: string): IntakeRoute | null {
  const spaced = normalizeIntakeSpaced(copy)
  if (!spaced || intakeTextHasComplaint(copy)) return null
  const empleo = hasWord(spaced, 'empleo') || hasWord(spaced, 'vacante') || hasWord(spaced, 'trabajo')
  const hogar = hasWord(spaced, 'limpieza') || hasWord(spaced, 'hogar') || hasWord(spaced, 'precio') || hasWord(spaced, 'domestica')
  const empresas = hasWord(spaced, 'oficina') || hasWord(spaced, 'local') || hasWord(spaced, 'empresa') || hasWord(spaced, 'empresarial')
  const count = Number(empleo) + Number(hogar) + Number(empresas)
  if (count !== 1) return null
  if (empleo) return 'empleo'
  if (hogar) return 'hogar'
  return 'empresas'
}

/** El mensaje claro gana. Un saludo o un pedido genérico usa el anuncio. */
export function resolveMessageIntent(body: string, adCopy: string | null): IntakeRead | null {
  const fromText = intakeIntentFromText(body)
  if (fromText === 'hogar' || fromText === 'empresas' || fromText === 'empleo') return fromText
  if (intakeTextHasComplaint(body)) return 'no_se_entiende'
  if (!isGenericIntake(body)) return fromText
  return adIntentFromCopy(adCopy ?? '')
}

export function adCueFromMessage(message: Record<string, unknown> | null | undefined): AdCue | null {
  if (!message) return null
  const referral = message.referral
  if (!referral || typeof referral !== 'object' || Array.isArray(referral)) return null
  const record = referral as Record<string, unknown>
  const sourceType = typeof record.source_type === 'string' ? record.source_type.trim() : ''
  if (sourceType && sourceType !== 'ad') return null
  const sourceId = typeof record.source_id === 'string' ? record.source_id.trim() : ''
  if (!sourceId) return null
  return {
    sourceId,
    headline: typeof record.headline === 'string' ? record.headline.trim() : '',
    body: typeof record.body === 'string' ? record.body.trim() : '',
  }
}

export function adDisplayLabel(ad: AdCue | null): string | null {
  if (!ad) return null
  const named = AD_NAMES[ad.sourceId]
  if (named) return named
  const headline = ad.headline.replace(/\s+/g, ' ').trim()
  if (headline) return headline.slice(0, 80)
  return ad.sourceId
}

export function intakeProfileSentence(input: {
  route: IntakeRoute
  phrase: string
  adLabel: string | null
}): string {
  const asked = input.route === 'empleo'
    ? 'Busca empleo.'
    : input.route === 'empresas'
      ? 'Pidió limpieza empresarial.'
      : 'Pidió limpieza del hogar.'
  const pending = input.route === 'empleo'
    ? 'Aún no envía hoja de vida.'
    : input.route === 'empresas'
      ? 'Aún no da tipo de espacio.'
      : 'Aún no da dirección ni fecha.'
  const quote = input.phrase.replace(/\s+/g, ' ').trim().slice(0, 160)
  const who = input.adLabel ? `Anuncio 312, ${input.adLabel}.` : 'Anuncio 312.'
  const wrote = quote ? ` Escribió: «${quote}».` : ''
  return `${who} ${asked}${wrote} ${pending}`
}

export function confirmIntakeModel(
  text: string,
  model: IntakeModelJudgment | null,
  adCopy = '',
): IntakeRoute | null {
  if (!model || model.hasComplaint || intakeTextHasComplaint(text)) return null
  if (model.intent !== 'hogar' && model.intent !== 'empresas' && model.intent !== 'empleo') return null
  const haystack = [text, adCopy].filter((part) => part.trim()).join('\n')
  if (!quotesExistInBlock(haystack, [model.evidence])) return null
  return model.intent
}
