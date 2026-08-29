import { assertEquals } from 'jsr:@std/assert';
import { isCompactJws, isInvalidCompactJwsError } from './whatsappMediaAuth.ts';

Deno.test('accepts a three-part JWT and rejects secret keys', () => {
  assertEquals(isCompactJws('eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.sig'), true);
  assertEquals(isCompactJws('sb_secret_abc'), false);
  assertEquals(isCompactJws('not-a-jwt'), false);
  assertEquals(isCompactJws(''), false);
});

Deno.test('detects TUS Invalid Compact JWS errors', () => {
  assertEquals(
    isInvalidCompactJwsError(new Error('TUS create failed (400): {"message":"Invalid Compact JWS"}')),
    true,
  );
  assertEquals(isInvalidCompactJwsError(new Error('network')), false);
});
