import { BOT_PHONE_NUMBER_ID } from './whatsappLines.ts';

/** El 312 le escribe a este número. Francy lo maneja. */
export const FRANCY_COMMERCIAL_WA = '573112121108';
const FRANCY_COMMERCIAL_KEY = '3112121108';

export const FRANCY_ASSISTANT_URL_DEFAULT =
  'https://us-central1-prosavis.cloudfunctions.net/francyAssistantTurn';

export type FrancyNotice = {
  waMessageId: string;
  from: string;
  phoneNumberId: string;
  messageType: string;
  text: string | null;
  caption: string | null;
  mediaId: string | null;
  mimeType: string | null;
  filename: string | null;
};

function phoneKey(value: string): string | null {
  const digits = value.replace(/\D/g, '');
  if (digits.length < 10) return null;
  return digits.slice(-10);
}

export function buildFrancyNotice(input: {
  field: string;
  from: string;
  phoneNumberId: string | null;
  waMessageId: string;
  messageType: string;
  text: string | null;
  caption: string | null;
  mediaId: string | null;
  mimeType: string | null;
  filename: string | null;
}): FrancyNotice | null {
  if (input.field !== 'messages') return null;
  const phoneNumberId = (input.phoneNumberId ?? '').trim();
  if (phoneNumberId !== BOT_PHONE_NUMBER_ID) return null;
  if (phoneKey(input.from) !== FRANCY_COMMERCIAL_KEY) return null;
  const waMessageId = input.waMessageId.trim();
  if (!waMessageId) return null;
  return {
    waMessageId,
    from: input.from.trim(),
    phoneNumberId,
    messageType: input.messageType || 'text',
    text: input.text,
    caption: input.caption,
    mediaId: input.mediaId,
    mimeType: input.mimeType,
    filename: input.filename,
  };
}

export async function postFrancyAssistantNotice(
  notice: FrancyNotice,
  env: { url?: string; secret?: string; fetchImpl?: typeof fetch },
): Promise<void> {
  const secret = (env.secret ?? '').trim();
  if (!secret) return;
  const url = (env.url ?? '').trim() || FRANCY_ASSISTANT_URL_DEFAULT;
  const fetchImpl = env.fetchImpl ?? fetch;
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-francy-assistant-secret': secret,
    },
    body: JSON.stringify(notice),
  });
  if (!response.ok) {
    throw new Error(`francy-assistant ${response.status}`);
  }
}
