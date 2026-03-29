import { createServiceRoleClient } from "@/lib/supabase/admin";

export function isCopilotEnabledInModules(enabledModules: unknown): boolean {
  if (enabledModules == null || typeof enabledModules !== "object") return true;
  const m = enabledModules as Record<string, unknown>;
  if (!("copilot" in m)) return true;
  return m.copilot !== false;
}

export async function getCopilotModuleEnabledForCompany(companyId: string): Promise<boolean> {
  try {
    const admin = createServiceRoleClient();
    const { data, error } = await admin
      .from("companies")
      .select("enabled_modules")
      .eq("id", companyId)
      .maybeSingle();
    if (error || !data) return true;
    return isCopilotEnabledInModules(data.enabled_modules);
  } catch {
    return true;
  }
}
