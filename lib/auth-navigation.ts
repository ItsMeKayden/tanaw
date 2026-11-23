export function getRoleLandingPath(role: string | null | undefined): string {
  if (role === "GUIDANCE") return "/guidance";
  if (role === "REGISTRAR") return "/registrar";
  return "/dashboard";
}
