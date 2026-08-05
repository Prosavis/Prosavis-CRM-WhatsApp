import { getFirestoreAdminDoc } from "./firebaseAdminRest.ts";
import { verifyFirebaseToken } from "./firebaseAuth.ts";
import { getServiceClient } from "./supabase.ts";
import { strictJsonResponse } from "./strictCors.ts";

type ServiceClient = ReturnType<typeof getServiceClient>;

const FALLBACK_ADMIN_EMAILS = [
  "admin@prosavis.com",
  "support@prosavis.com",
  "oliverafrancy@gmail.com",
];

export interface AdminActor {
  kind: "firebase" | "supabase";
  uid: string;
  email?: string;
}

export interface AdminContext<Client> {
  supabase: Client;
  actor: AdminActor;
}

export interface FirebaseIdentity {
  uid: string;
}

export interface SupabaseIdentity {
  uid: string;
  email?: string;
}

export interface SupabaseAdminProfile {
  email?: string | null;
  role: string;
  isActive: boolean;
}

export interface AdminAuthDependencies<Client> {
  createServiceClient: () => Client;
  verifyFirebaseToken: (request: Request) => Promise<FirebaseIdentity | null>;
  getFirebaseAdminDoc: (uid: string) => Promise<Record<string, unknown> | null>;
  verifySupabaseToken: (
    token: string,
    client: Client,
  ) => Promise<SupabaseIdentity | null>;
  getSupabaseAdminProfile: (
    uid: string,
    client: Client,
  ) => Promise<SupabaseAdminProfile | null>;
  authorizedAdminEmails: readonly string[];
}

export type FirebaseAdminDocumentActivePolicy = (
  document: Record<string, unknown>,
) => boolean;

export interface AdminGuardOptions {
  isFirebaseAdminDocumentActive?: FirebaseAdminDocumentActivePolicy;
}

export const requireExplicitFirebaseAdminActive:
  FirebaseAdminDocumentActivePolicy = (
    document,
  ) => document.isActive === true || document.active === true;

export const preserveLegacyFirebaseAdminActive:
  FirebaseAdminDocumentActivePolicy = (
    document,
  ) =>
    document.isActive === true ||
    document.active === true ||
    (document.isActive === undefined && document.active === undefined);

function bearerToken(request: Request): string | null {
  const authorization = request.headers.get("Authorization") ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1].trim() || null;
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const payload = token.split(".")[1];
  if (!payload) return null;

  try {
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(
      base64.length + ((4 - base64.length % 4) % 4),
      "=",
    );
    return JSON.parse(atob(padded)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function isFirebaseIssuer(payload: Record<string, unknown> | null): boolean {
  return typeof payload?.iss === "string" &&
    payload.iss.startsWith("https://securetoken.google.com/");
}

export function createAdminGuard<Client>(
  dependencies: AdminAuthDependencies<Client>,
  options: AdminGuardOptions = {},
): (request: Request) => Promise<AdminContext<Client>> {
  const isFirebaseAdminDocumentActive = options.isFirebaseAdminDocumentActive ??
    requireExplicitFirebaseAdminActive;

  return async (request: Request): Promise<AdminContext<Client>> => {
    const token = bearerToken(request);
    if (!token) {
      throw strictJsonResponse(
        request,
        { error: "Usuario no autenticado." },
        401,
      );
    }

    const payload = decodeJwtPayload(token);
    if (isFirebaseIssuer(payload)) {
      let identity: FirebaseIdentity | null = null;
      try {
        identity = await dependencies.verifyFirebaseToken(request);
      } catch {
        // Normalize legacy verifier errors through strict CORS below.
      }
      if (!identity) {
        throw strictJsonResponse(
          request,
          { error: "Usuario no autenticado." },
          401,
        );
      }
      const email = typeof payload?.email === "string"
        ? payload.email
        : undefined;
      const allowlisted = email !== undefined &&
        dependencies.authorizedAdminEmails.some(
          (authorizedEmail) =>
            authorizedEmail.toLowerCase() === email.toLowerCase(),
        );
      if (payload?.admin === true || allowlisted) {
        return {
          supabase: dependencies.createServiceClient(),
          actor: { kind: "firebase", uid: identity.uid, email },
        };
      }

      let adminDocument: Record<string, unknown> | null = null;
      try {
        adminDocument = await dependencies.getFirebaseAdminDoc(identity.uid);
      } catch {
        // Unavailable admin lookup does not grant access.
      }
      const role = String(adminDocument?.role ?? "");
      const hasAdminRole = adminDocument?.isAdmin === true ||
        ["admin", "super_admin", "superadmin"].includes(role);
      const isActive = adminDocument !== null &&
        isFirebaseAdminDocumentActive(adminDocument);
      if (hasAdminRole && isActive) {
        return {
          supabase: dependencies.createServiceClient(),
          actor: { kind: "firebase", uid: identity.uid, email },
        };
      }

      throw strictJsonResponse(
        request,
        { error: "Usuario sin permisos de administrador." },
        403,
      );
    }

    const supabase = dependencies.createServiceClient();
    let identity: SupabaseIdentity | null = null;
    try {
      identity = await dependencies.verifySupabaseToken(token, supabase);
    } catch {
      // Authentication failures are intentionally normalized.
    }
    if (!identity) {
      throw strictJsonResponse(
        request,
        { error: "Usuario no autenticado." },
        401,
      );
    }

    let profile: SupabaseAdminProfile | null = null;
    try {
      profile = await dependencies.getSupabaseAdminProfile(
        identity.uid,
        supabase,
      );
    } catch {
      // Profile lookup failures do not grant access.
    }
    if (profile?.isActive && ["admin", "super_admin"].includes(profile.role)) {
      return {
        supabase,
        actor: {
          kind: "supabase",
          uid: identity.uid,
          email: profile.email ?? identity.email,
        },
      };
    }
    throw strictJsonResponse(
      request,
      { error: "Usuario sin permisos de administrador." },
      403,
    );
  };
}

function authorizedAdminEmails(): string[] {
  const configured = Deno.env.get("AUTHORIZED_ADMIN_EMAILS");
  const values = configured ? configured.split(",") : FALLBACK_ADMIN_EMAILS;
  return values.map((email) => email.trim().toLowerCase()).filter(Boolean);
}

async function verifySupabaseIdentity(
  token: string,
  client: ServiceClient,
): Promise<SupabaseIdentity | null> {
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) return null;
  return {
    uid: data.user.id,
    email: data.user.email,
  };
}

async function getSupabaseAdminProfile(
  uid: string,
  client: ServiceClient,
): Promise<SupabaseAdminProfile | null> {
  const { data, error } = await client
    .from("admin_profiles")
    .select("email,role,is_active")
    .eq("id", uid)
    .single();
  if (error || !data) return null;
  return {
    email: typeof data.email === "string" ? data.email : null,
    role: String(data.role ?? ""),
    isActive: data.is_active === true,
  };
}

const defaultDependencies: AdminAuthDependencies<ServiceClient> = {
  createServiceClient: getServiceClient,
  verifyFirebaseToken,
  getFirebaseAdminDoc: getFirestoreAdminDoc,
  verifySupabaseToken: verifySupabaseIdentity,
  getSupabaseAdminProfile,
  authorizedAdminEmails: authorizedAdminEmails(),
};

export function createDefaultAdminGuard(
  options: AdminGuardOptions = {},
): (request: Request) => Promise<AdminContext<ServiceClient>> {
  return createAdminGuard(defaultDependencies, options);
}

const defaultRequireAdmin = createDefaultAdminGuard();

export function requireAdmin(
  request: Request,
): Promise<AdminContext<ServiceClient>> {
  return defaultRequireAdmin(request);
}
