import { assertEquals } from 'jsr:@std/assert';
import { isOutboundDeliverySuccess } from './whatsappDeliveryStatus.ts';

Deno.test('played voice notes count as a successful delivery', () => {
  assertEquals(isOutboundDeliverySuccess('played'), true);
  assertEquals(isOutboundDeliverySuccess('read'), true);
  assertEquals(isOutboundDeliverySuccess('failed'), false);
  assertEquals(isOutboundDeliverySuccess('pending'), false);
});
