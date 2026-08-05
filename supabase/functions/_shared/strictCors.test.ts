import {
  corsHeadersForRequest,
  isOriginAllowed,
  strictJsonResponse,
  strictPreflightResponse,
} from "./strictCors.ts";

const DEFAULT_ALLOWED_ORIGINS = [
  "https://prosavis-userconsole.web.app",
  "https://prosavis-userconsole.firebaseapp.com",
  "https://userconsole.prosavis.com",
  "https://prosavis-crm-whatsapp.vercel.app",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:3001",
  "http://127.0.0.1:3001",
];

function assert(
  condition: unknown,
  message = "Assertion failed",
): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEquals<T>(actual: T, expected: T, message?: string): void {
  if (!Object.is(actual, expected)) {
    throw new Error(
      message ?? `Expected ${String(expected)}, received ${String(actual)}`,
    );
  }
}

function request(origin?: string, method = "GET"): Request {
  const headers = new Headers();
  if (origin !== undefined) headers.set("Origin", origin);
  return new Request("https://example.test/functions/v1/example", {
    headers,
    method,
  });
}

Deno.test("allows every exact default origin", () => {
  for (const origin of DEFAULT_ALLOWED_ORIGINS) {
    assert(isOriginAllowed(origin), `Expected ${origin} to be allowed`);
    const headers = corsHeadersForRequest(request(origin));
    assertEquals(headers.get("Access-Control-Allow-Origin"), origin);
    assertEquals(headers.get("Vary"), "Origin");
  }
});

Deno.test("allows exact origins configured through OPS_V5_ALLOWED_ORIGINS", () => {
  const configured = "https://ops.prosavis.com, https://preview.prosavis.com";
  assert(isOriginAllowed("https://ops.prosavis.com", configured));
  assert(isOriginAllowed("https://preview.prosavis.com", configured));
});

Deno.test("rejects lookalikes, wildcard configuration, null and unknown origins", () => {
  const rejected = [
    "https://evil.userconsole.prosavis.com",
    "https://userconsole.prosavis.com.evil.example",
    "null",
    "https://unknown.example",
  ];

  for (const origin of rejected) {
    assertEquals(
      isOriginAllowed(origin),
      false,
      `Expected ${origin} to be rejected`,
    );
    assertEquals(
      corsHeadersForRequest(request(origin)).has("Access-Control-Allow-Origin"),
      false,
    );
  }
  assertEquals(isOriginAllowed("https://unknown.example", "*"), false);
});

Deno.test("server-to-server requests without Origin receive no ACAO header", () => {
  const headers = corsHeadersForRequest(request());
  assertEquals(headers.has("Access-Control-Allow-Origin"), false);
});

Deno.test("allowed preflight returns the strict methods and headers", () => {
  const origin = DEFAULT_ALLOWED_ORIGINS[0];
  const response = strictPreflightResponse(request(origin, "OPTIONS"));

  assertEquals(response.status, 204);
  assertEquals(response.headers.get("Access-Control-Allow-Origin"), origin);
  assertEquals(
    response.headers.get("Access-Control-Allow-Methods"),
    "GET, POST, OPTIONS",
  );
  assertEquals(
    response.headers.get("Access-Control-Allow-Headers"),
    "authorization, x-client-info, apikey, content-type",
  );
});

Deno.test("denied preflight returns 403 without ACAO", async () => {
  const response = strictPreflightResponse(
    request("https://attacker.example", "OPTIONS"),
  );

  assertEquals(response.status, 403);
  assertEquals(response.headers.has("Access-Control-Allow-Origin"), false);
  assertEquals(response.headers.get("Content-Type"), "application/json");
  assertEquals((await response.json()).error, "Origin no permitido.");
});

Deno.test("JSON responses always set content type and only reflect allowed origins", async () => {
  const allowedOrigin = DEFAULT_ALLOWED_ORIGINS[2];
  const allowed = strictJsonResponse(request(allowedOrigin), { ok: true }, 201);
  const denied = strictJsonResponse(request("https://attacker.example"), {
    ok: false,
  }, 400);

  assertEquals(allowed.status, 201);
  assertEquals(allowed.headers.get("Content-Type"), "application/json");
  assertEquals(
    allowed.headers.get("Access-Control-Allow-Origin"),
    allowedOrigin,
  );
  assertEquals((await allowed.json()).ok, true);

  assertEquals(denied.status, 400);
  assertEquals(denied.headers.get("Content-Type"), "application/json");
  assertEquals(denied.headers.has("Access-Control-Allow-Origin"), false);
});
