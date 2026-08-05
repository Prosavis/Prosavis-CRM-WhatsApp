const DEFAULT_ALLOWED_ORIGINS = new Set([
  "https://prosavis-userconsole.web.app",
  "https://prosavis-userconsole.firebaseapp.com",
  "https://userconsole.prosavis.com",
  "https://prosavis-crm-whatsapp.vercel.app",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:3001",
  "http://127.0.0.1:3001",
]);

const ALLOWED_METHODS = "GET, POST, OPTIONS";
const ALLOWED_HEADERS = "authorization, x-client-info, apikey, content-type";

function configuredOrigins(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0 && !origin.includes("*"));
}

export function isOriginAllowed(
  origin: string | null,
  configuredValue = Deno.env.get("OPS_V5_ALLOWED_ORIGINS"),
): boolean {
  if (!origin || origin === "null") return false;
  return DEFAULT_ALLOWED_ORIGINS.has(origin) ||
    configuredOrigins(configuredValue).includes(origin);
}

export function corsHeadersForRequest(request: Request): Headers {
  const headers = new Headers();
  const origin = request.headers.get("Origin");

  if (!origin || !isOriginAllowed(origin)) return headers;

  headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Access-Control-Allow-Methods", ALLOWED_METHODS);
  headers.set("Access-Control-Allow-Headers", ALLOWED_HEADERS);
  headers.set("Vary", "Origin");
  return headers;
}

export function strictJsonResponse(
  request: Request,
  body: unknown,
  status = 200,
): Response {
  const headers = corsHeadersForRequest(request);
  headers.set("Content-Type", "application/json");
  return new Response(JSON.stringify(body), { status, headers });
}

export function strictPreflightResponse(request: Request): Response {
  if (!isOriginAllowed(request.headers.get("Origin"))) {
    return strictJsonResponse(request, { error: "Origin no permitido." }, 403);
  }

  return new Response(null, {
    status: 204,
    headers: corsHeadersForRequest(request),
  });
}
