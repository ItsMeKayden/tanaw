import { NextResponse } from "next/server";

import { auth } from "@/auth";

export default auth((request) => {
  if (request.auth) return NextResponse.next();

  const loginUrl = new URL("/auth/login", request.nextUrl);
  loginUrl.searchParams.set(
    "returnUrl",
    `${request.nextUrl.pathname}${request.nextUrl.search}`,
  );
  return NextResponse.redirect(loginUrl);
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
