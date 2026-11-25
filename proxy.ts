import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { getRoleLandingPath } from "@/lib/auth-navigation";
import type { UserRole } from "@/lib/authorization";
import { canOpenNavigationPath } from "@/lib/navigation";

export default auth(async (request) => {
  if (!request.auth) {
    const loginUrl = new URL("/auth/login", request.nextUrl);
    loginUrl.searchParams.set(
      "returnUrl",
      `${request.nextUrl.pathname}${request.nextUrl.search}`,
    );
    return NextResponse.redirect(loginUrl);
  }

  // A sidebar page the role can't open (e.g. a saved link or a return URL
  // from another account): send them to their own landing page here, before
  // the page starts streaming, instead of a forbidden() mid-stream. Other
  // paths are checked by the page itself.
  const role = request.auth.user?.role as UserRole | undefined;
  const { pathname } = request.nextUrl;
  if (role) {
    const landing = getRoleLandingPath(role);
    if (pathname !== landing && (await canOpenNavigationPath(role, pathname)) === false) {
      return NextResponse.redirect(new URL(landing, request.nextUrl));
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/admission/:path*",
    "/dashboard/:path*",
    "/guidance/:path*",
    "/map/:path*",
    "/recommendation/:path*",
    "/registrar/:path*",
    "/reports/:path*",
    "/user-management/:path*",
  ],
};
