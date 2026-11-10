import { assertEquals } from 'jsr:@std/assert';
import {
  COMMERCIAL_PHONE_NUMBER_ID,
  BOT_PHONE_NUMBER_ID,
} from './whatsappLines.ts';
import {
  COMMERCIAL_REPLAY_DEFAULT_SINCE,
  filterCommercialWebhookEvents,
  isReplayAllLinesRequest,
  isReplayUnprocessedRequest,
  isReplayableWebhookEvent,
  payloadHasPhoneNumberId,
  replaySinceFromPayload,
  stableKeysTouchedByPayload,
} from './whatsappWebhookReplay.ts';

const commercialPayload = {
  entry: [{
    changes: [{
      field: 'messages',
      value: {
        metadata: { phone_number_id: COMMERCIAL_PHONE_NUMBER_ID },
        messages: [{ from: '573005653159', id: 'wamid.1' }],
      },
    }],
  }],
};

const botPayload = {
  entry: [{
    changes: [{
      field: 'messages',
      value: {
        metadata: { phone_number_id: BOT_PHONE_NUMBER_ID },
        messages: [{ from_user_id: 'CO.1', id: 'wamid.2' }],
      },
    }],
  }],
};

Deno.test('replay request is detected before webhook persistence', () => {
  assertEquals(isReplayUnprocessedRequest({ replay_unprocessed: true }), true);
  assertEquals(isReplayUnprocessedRequest({ replay_unprocessed: false }), false);
  assertEquals(isReplayAllLinesRequest({ replay_unprocessed: true }), false);
  assertEquals(isReplayAllLinesRequest({ replay_unprocessed: true, all_lines: true }), true);
  assertEquals(isReplayUnprocessedRequest(commercialPayload), false);
  assertEquals(replaySinceFromPayload({ replay_unprocessed: true }), COMMERCIAL_REPLAY_DEFAULT_SINCE);
  assertEquals(
    replaySinceFromPayload({ replay_unprocessed: true, since: '2026-08-27T20:00:00.000Z' }),
    '2026-08-27T20:00:00.000Z',
  );
});

Deno.test('replay keeps commercial events and drops bot LID leftovers', () => {
  assertEquals(payloadHasPhoneNumberId(commercialPayload, COMMERCIAL_PHONE_NUMBER_ID), true);
  assertEquals(payloadHasPhoneNumberId(botPayload, COMMERCIAL_PHONE_NUMBER_ID), false);
  const filtered = filterCommercialWebhookEvents([
    { id: 'commercial', payload: commercialPayload },
    { id: 'bot', payload: botPayload },
  ]);
  assertEquals(filtered.map((event) => event.id), ['commercial']);
});

Deno.test('replay only reprocesses messages and coexistence echoes', () => {
  assertEquals(isReplayableWebhookEvent({ event_type: 'messages' }), true);
  assertEquals(isReplayableWebhookEvent({ event_type: 'smb_message_echoes' }), true);
  assertEquals(isReplayableWebhookEvent({ event_type: 'history' }), false);
  assertEquals(isReplayableWebhookEvent({ event_type: 'smb_app_state_sync' }), false);
  assertEquals(
    stableKeysTouchedByPayload(commercialPayload),
    [`573005653159__${COMMERCIAL_PHONE_NUMBER_ID}`],
  );
  assertEquals(stableKeysTouchedByPayload(botPayload), ['lid:CO.1']);
  assertEquals(
    stableKeysTouchedByPayload({
      entry: [{
        changes: [{
          field: 'history',
          value: { metadata: { phone_number_id: COMMERCIAL_PHONE_NUMBER_ID } },
        }],
      }],
    }),
    [],
  );
});
