import { assertEquals } from 'jsr:@std/assert';
import {
  activityBlocksVoiceNudge,
  CTWA_VOICE_NUDGE_SCRIPT,
  decideVoiceNudgeSend,
  isTeamTextTakeover,
  voiceNudgeDueAt,
  voiceNudgeKindForAction,
  voiceNudgeStillHot,
} from './ctwaVoiceNudge.ts';

const BOT = '1035566289641219';
const OTHER = '1043086062223440';

const quiet = {
  phoneNumberId: BOT,
  automatedInboundDisabled: false,
  blocked: false,
  sessionClosed: false,
  inboundAfterAnchor: false,
  agentAfterAnchor: false,
  routeAfterAnchor: false,
};

Deno.test('empleo does not enqueue a voice note', () => {
  assertEquals(voiceNudgeKindForAction('inicio'), 'menu');
  assertEquals(voiceNudgeKindForAction('hogar'), 'hogar');
  assertEquals(voiceNudgeKindForAction('empresas'), 'empresas');
  assertEquals(voiceNudgeKindForAction('empleo'), null);
  assertEquals(voiceNudgeKindForAction('none'), null);
});

Deno.test('the nudge is due five minutes after the anchor', () => {
  const anchor = new Date('2026-10-22T20:00:00.000Z');
  assertEquals(voiceNudgeDueAt(anchor).toISOString(), '2026-10-22T20:05:00.000Z');
});

Deno.test('a note more than ten minutes late is no longer hot', () => {
  const now = new Date('2026-10-22T20:20:00.000Z');
  assertEquals(voiceNudgeStillHot('2026-10-22T20:16:00.000Z', now), true);
  assertEquals(voiceNudgeStillHot('2026-10-22T20:09:00.000Z', now), false);
});

Deno.test('a quiet menu on 312 gets the note', () => {
  assertEquals(decideVoiceNudgeSend({ ...quiet, kind: 'menu' }), { send: true });
});

Deno.test('menu note is skipped once they write, an agent replies, or the ficha already went out', () => {
  assertEquals(
    decideVoiceNudgeSend({ ...quiet, kind: 'menu', inboundAfterAnchor: true }),
    { send: false, reason: 'inbound_after_anchor' },
  );
  assertEquals(
    decideVoiceNudgeSend({ ...quiet, kind: 'menu', agentAfterAnchor: true }),
    { send: false, reason: 'agent_after_anchor' },
  );
  assertEquals(
    decideVoiceNudgeSend({ ...quiet, kind: 'menu', routeAfterAnchor: true }),
    { send: false, reason: 'route_already_sent' },
  );
  assertEquals(
    decideVoiceNudgeSend({ ...quiet, kind: 'menu', automatedInboundDisabled: true }),
    { send: false, reason: 'automated_disabled' },
  );
  assertEquals(
    decideVoiceNudgeSend({ ...quiet, kind: 'menu', blocked: true }),
    { send: false, reason: 'blocked' },
  );
  assertEquals(
    decideVoiceNudgeSend({ ...quiet, kind: 'menu', sessionClosed: true }),
    { send: false, reason: 'session_closed' },
  );
  assertEquals(
    decideVoiceNudgeSend({ ...quiet, kind: 'menu', phoneNumberId: OTHER }),
    { send: false, reason: 'not_bot_line' },
  );
});

Deno.test('domestica and empresarial notes still send after their ficha', () => {
  assertEquals(
    decideVoiceNudgeSend({ ...quiet, kind: 'hogar', routeAfterAnchor: true }),
    { send: true },
  );
  assertEquals(
    decideVoiceNudgeSend({ ...quiet, kind: 'empresas', routeAfterAnchor: true }),
    { send: true },
  );
  assertEquals(
    decideVoiceNudgeSend({ ...quiet, kind: 'hogar', inboundAfterAnchor: true }),
    { send: false, reason: 'inbound_after_anchor' },
  );
  assertEquals(
    decideVoiceNudgeSend({ ...quiet, kind: 'empresas', agentAfterAnchor: true }),
    { send: false, reason: 'agent_after_anchor' },
  );
});

Deno.test('activity after the anchor is read from the log', () => {
  assertEquals(activityBlocksVoiceNudge([
    { direction: 'inbound', sender_type: 'user', sent_via: null, campaign_type: null },
  ]), {
    inboundAfterAnchor: true,
    agentAfterAnchor: false,
    routeAfterAnchor: false,
  });
  assertEquals(activityBlocksVoiceNudge([
    { direction: 'outbound', sender_type: 'agent', sent_via: 'crm', campaign_type: 'OTHER' },
    { direction: 'outbound', sender_type: 'system', sent_via: 'system', campaign_type: 'CTWA_ROUTE' },
  ]), {
    inboundAfterAnchor: false,
    agentAfterAnchor: true,
    routeAfterAnchor: true,
  });
});

Deno.test('a lone heart is not a team reply', () => {
  assertEquals(isTeamTextTakeover('❤️'), false);
  assertEquals(isTeamTextTakeover(''), false);
  assertEquals(isTeamTextTakeover('Con gusto le ayudamos'), true);
});

Deno.test('the three scripts ask for the next fact and empleo has none', () => {
  assertEquals(CTWA_VOICE_NUDGE_SCRIPT.menu.includes('Te habla Sofía'), true);
  assertEquals(CTWA_VOICE_NUDGE_SCRIPT.hogar.includes('municipio'), true);
  assertEquals(CTWA_VOICE_NUDGE_SCRIPT.empresas.includes('cotización'), true);
  assertEquals('empleo' in CTWA_VOICE_NUDGE_SCRIPT, false);
});
