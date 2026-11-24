export function getRoleLandingPath(role: string | null | undefined): string {
  if (role === "GUIDANCE") return "/guidance";
  if (role === "REGISTRAR") return "/registrar";
  return "/dashboard";
}

export function getSafeReturnUrl(value: unknown): string | null {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\")
  ) {
    return null;
  }

  const parsed = new URL(value, "https://tanaw.invalid");
  if (
    parsed.origin !== "https://tanaw.invalid" ||
    parsed.pathname === "/auth/login"
  ) {
    return null;
  }
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}
