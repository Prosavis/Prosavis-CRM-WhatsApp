import {
  type AdminAuthDependencies,
  createAdminGuard,
  requireAdmin,
} from "./adminAuth.ts";
import { requireDirectoryAdmin } from "./directoryMonitorAuth.ts";

interface FakeClient {
  name: string;
}

function assertEquals<T>(actual: T, expected: T, message?: string): void {
  if (!Object.is(actual, expected)) {
    throw new Error(
      message ?? `Expected ${String(expected)}, received ${String(actual)}`,
    );
  }
}

function authRequest(
  token?: string,
  origin = "https://userconsole.prosavis.com",
): Request {
  const headers = new Headers({ Origin: origin });
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return new Request("https://example.test/functions/v1/admin", { headers });
}

function unsignedToken(payload: Record<string, unknown>): string {
  const encode = (value: Record<string, unknown>) =>
    btoa(JSON.stringify(value))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");
  return `${encode({ alg: "none" })}.${encode(payload)}.signature`;
}

function dependencies(
  overrides: Partial<AdminAuthDependencies<FakeClient>> = {},
): AdminAuthDependencies<FakeClient> {
  return {
    createServiceClient: () => ({ name: "service-role-client" }),
    verifyFirebaseToken: () => Promise.resolve(null),
    getFirebaseAdminDoc: () => Promise.resolve(null),
    verifySupabaseToken: () => Promise.resolve(null),
    getSupabaseAdminProfile: () => Promise.resolve(null),
    authorizedAdminEmails: [],
    ...overrides,
  };
}

async function thrownResponse(
  action: () => Promise<unknown>,
): Promise<Response> {
  try {
    await action();
  } catch (error) {
    if (error instanceof Response) return error;
    throw error;
  }
  throw new Error("Expected the guard to throw a Response");
}

Deno.test("missing bearer token returns strict 401 JSON", async () => {
  const requireAdmin = createAdminGuard(dependencies());
  const response = await thrownResponse(() => requireAdmin(authRequest()));

  assertEquals(response.status, 401);
  assertEquals(response.headers.get("Content-Type"), "application/json");
  assertEquals(
    response.headers.get("Access-Control-Allow-Origin"),
    "https://userconsole.prosavis.com",
  );
  assertEquals((await response.json()).error, "Usuario no autenticado.");
});

Deno.test("invalid Firebase token returns 401", async () => {
  let verificationCalls = 0;
  const requireAdmin = createAdminGuard(
    dependencies({
      verifyFirebaseToken: () => {
        verificationCalls++;
        return Promise.resolve(null);
      },
    }),
  );
  const token = unsignedToken({
    iss: "https://securetoken.google.com/prosavis",
    sub: "firebase-user",
  });

  const response = await thrownResponse(() => requireAdmin(authRequest(token)));

  assertEquals(verificationCalls, 1);
  assertEquals(response.status, 401);
  assertEquals((await response.json()).error, "Usuario no autenticado.");
});

Deno.test("valid non-admin Firebase identity returns 403", async () => {
  const requireAdmin = createAdminGuard(
    dependencies({
      verifyFirebaseToken: () => Promise.resolve({ uid: "firebase-user" }),
    }),
  );
  const token = unsignedToken({
    iss: "https://securetoken.google.com/prosavis",
    sub: "firebase-user",
    email: "member@example.com",
  });

  const response = await thrownResponse(() => requireAdmin(authRequest(token)));

  assertEquals(response.status, 403);
  assertEquals(
    (await response.json()).error,
    "Usuario sin permisos de administrador.",
  );
});

Deno.test("Firebase admin claim returns normalized Firebase context", async () => {
  const client = { name: "claim-client" };
  const requireAdmin = createAdminGuard(
    dependencies({
      createServiceClient: () => client,
      verifyFirebaseToken: () => Promise.resolve({ uid: "firebase-admin" }),
    }),
  );
  const token = unsignedToken({
    iss: "https://securetoken.google.com/prosavis",
    sub: "firebase-admin",
    email: "admin@example.com",
    admin: true,
  });

  const context = await requireAdmin(authRequest(token));

  assertEquals(context.supabase, client);
  assertEquals(context.actor.kind, "firebase");
  assertEquals(context.actor.uid, "firebase-admin");
  assertEquals(context.actor.email, "admin@example.com");
});

Deno.test("allowlisted Firebase email returns admin context case-insensitively", async () => {
  const requireAdmin = createAdminGuard(
    dependencies({
      verifyFirebaseToken: () => Promise.resolve({ uid: "allowlisted-admin" }),
      authorizedAdminEmails: ["admin@prosavis.com"],
    }),
  );
  const token = unsignedToken({
    iss: "https://securetoken.google.com/prosavis",
    sub: "allowlisted-admin",
    email: "Admin@Prosavis.com",
  });

  const context = await requireAdmin(authRequest(token));

  assertEquals(context.actor.kind, "firebase");
  assertEquals(context.actor.uid, "allowlisted-admin");
  assertEquals(context.actor.email, "Admin@Prosavis.com");
});

Deno.test("active Firestore admin document returns Firebase context", async () => {
  const requireAdmin = createAdminGuard(
    dependencies({
      verifyFirebaseToken: () => Promise.resolve({ uid: "firestore-admin" }),
      getFirebaseAdminDoc: (uid) => {
        assertEquals(uid, "firestore-admin");
        return Promise.resolve({ role: "admin", isActive: true });
      },
    }),
  );
  const token = unsignedToken({
    iss: "https://securetoken.google.com/prosavis",
    sub: "firestore-admin",
    email: "firestore@example.com",
  });

  const context = await requireAdmin(authRequest(token));

  assertEquals(context.actor.kind, "firebase");
  assertEquals(context.actor.uid, "firestore-admin");
});

Deno.test("invalid Supabase token returns 401", async () => {
  let verificationCalls = 0;
  const requireAdmin = createAdminGuard(
    dependencies({
      verifySupabaseToken: () => {
        verificationCalls++;
        return Promise.resolve(null);
      },
    }),
  );
  const token = unsignedToken({
    iss: "https://project.supabase.co/auth/v1",
    sub: "supabase-user",
  });

  const response = await thrownResponse(() => requireAdmin(authRequest(token)));

  assertEquals(verificationCalls, 1);
  assertEquals(response.status, 401);
});

Deno.test("valid Supabase user without active admin profile returns 403", async () => {
  let profileCalls = 0;
  const requireAdmin = createAdminGuard(
    dependencies({
      verifySupabaseToken: () =>
        Promise.resolve({
          uid: "supabase-member",
          email: "member@example.com",
        }),
      getSupabaseAdminProfile: () => {
        profileCalls++;
        return Promise.resolve(null);
      },
    }),
  );
  const token = unsignedToken({
    iss: "https://project.supabase.co/auth/v1",
    sub: "supabase-member",
  });

  const response = await thrownResponse(() => requireAdmin(authRequest(token)));

  assertEquals(profileCalls, 1);
  assertEquals(response.status, 403);
  assertEquals(
    (await response.json()).error,
    "Usuario sin permisos de administrador.",
  );
});

Deno.test("active Supabase admin and super_admin return normalized contexts", async () => {
  for (const role of ["admin", "super_admin"]) {
    const client = { name: `${role}-client` };
    const requireAdmin = createAdminGuard(
      dependencies({
        createServiceClient: () => client,
        verifySupabaseToken: () =>
          Promise.resolve({ uid: `${role}-uid`, email: "auth@example.com" }),
        getSupabaseAdminProfile: () =>
          Promise.resolve({
            email: `${role}@example.com`,
            role,
            isActive: true,
          }),
      }),
    );
    const token = unsignedToken({
      iss: "https://project.supabase.co/auth/v1",
      sub: `${role}-uid`,
    });

    const context = await requireAdmin(authRequest(token));

    assertEquals(context.supabase, client);
    assertEquals(context.actor.kind, "supabase");
    assertEquals(context.actor.uid, `${role}-uid`);
    assertEquals(context.actor.email, `${role}@example.com`);
  }
});

Deno.test("public guard denies missing auth without reflecting an unknown origin", async () => {
  const response = await thrownResponse(() =>
    requireAdmin(authRequest(undefined, "https://attacker.example"))
  );

  assertEquals(response.status, 401);
  assertEquals(response.headers.has("Access-Control-Allow-Origin"), false);
});

Deno.test("requireDirectoryAdmin remains a strict-compatible facade", async () => {
  const response = await thrownResponse(() =>
    requireDirectoryAdmin(authRequest(undefined, "https://attacker.example"))
  );

  assertEquals(response.status, 401);
  assertEquals(response.headers.has("Access-Control-Allow-Origin"), false);
});
