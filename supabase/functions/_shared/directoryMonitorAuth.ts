import {
  type AdminActor,
  type AdminAuthDependencies,
  type AdminContext,
  createAdminGuard,
  createDefaultAdminGuard,
  preserveLegacyFirebaseAdminActive,
} from "./adminAuth.ts";

export type DirectoryAdminActor = AdminActor;
export type DirectoryAdminContext = Awaited<
  ReturnType<typeof defaultRequireDirectoryAdmin>
>;

const legacyAdminOptions = {
  isFirebaseAdminDocumentActive: preserveLegacyFirebaseAdminActive,
};

export function createDirectoryAdminGuard<Client>(
  dependencies: AdminAuthDependencies<Client>,
): (request: Request) => Promise<AdminContext<Client>> {
  return createAdminGuard(dependencies, legacyAdminOptions);
}

const defaultRequireDirectoryAdmin = createDefaultAdminGuard(
  legacyAdminOptions,
);

/**
 * Facade compatible para los monitores existentes. La validación dual y los
 * errores con CORS estricto viven en el guard V5 compartido.
 */
export function requireDirectoryAdmin(
  request: Request,
): Promise<DirectoryAdminContext> {
  return defaultRequireDirectoryAdmin(request);
}
