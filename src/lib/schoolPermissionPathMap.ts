import { moduleMeta, type ModuleKey } from "@/context/ModulesContext";
import type { PermissionModuleKey } from "@/lib/schoolPermissionModules";
import { normalizeNavPath } from "@/lib/staffNavAccess";

const routeModulePairs = (Object.entries(moduleMeta) as [ModuleKey, { path: string }][]).sort(
  (a, b) => b[1].path.length - a[1].path.length,
);

/**
 * Módulo granular associado ao caminho atual (prefixo mais longo).
 * Rotas transversais (painel, perfil, chat, …) ⇒ null (sempre permitidas quando autenticado).
 */
export function pathToPermissionModule(pathname: string): PermissionModuleKey | null {
  const p = normalizeNavPath(pathname);
  // `/definicoes` agrega várias áreas (ex.: faturação para secretaria); o acesso efectivo continua
  // com `canOpenDefinicoesPage` e `isDefinicoesTabAllowed` no interior da página.
  if (p.startsWith("/modulos")) return "modulos";
  for (const [key, meta] of routeModulePairs) {
    const base = meta.path.replace(/\/$/, "");
    if (p === base || p.startsWith(`${base}/`)) return key;
  }
  return null;
}
