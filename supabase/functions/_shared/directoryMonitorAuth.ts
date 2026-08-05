import { type AdminActor, requireAdmin } from "./adminAuth.ts";

export type DirectoryAdminActor = AdminActor;
export type DirectoryAdminContext = Awaited<ReturnType<typeof requireAdmin>>;

/**
 * Facade compatible para los monitores existentes. La validación dual y los
 * errores con CORS estricto viven en el guard V5 compartido.
 */
export function requireDirectoryAdmin(
  request: Request,
): Promise<DirectoryAdminContext> {
  return requireAdmin(request);
}
