import { createHash, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

export function isSameOriginRequest(request: NextRequest) {
  const origin = request.headers.get("origin");
  return origin !== null && origin === new URL(request.url).origin;
}

export function hasValidAuthCsrf(request: NextRequest) {
  const supplied = request.headers.get("x-csrf-token");
  if (!supplied || !process.env.AUTH_SECRET) return false;

  const cookie =
    request.cookies.get("__Host-authjs.csrf-token")?.value ??
    request.cookies.get("authjs.csrf-token")?.value;
  if (!cookie) return false;

  const [token, hash] = cookie.split("|");
  if (!token || !hash || token.length !== supplied.length) return false;

  const expectedHash = createHash("sha256")
    .update(`${token}${process.env.AUTH_SECRET}`)
    .digest("hex");
  const suppliedToken = Buffer.from(supplied);
  const cookieToken = Buffer.from(token);
  const suppliedHash = Buffer.from(hash);
  const expectedHashBuffer = Buffer.from(expectedHash);

  return (
    suppliedToken.length === cookieToken.length &&
    suppliedHash.length === expectedHashBuffer.length &&
    timingSafeEqual(suppliedToken, cookieToken) &&
    timingSafeEqual(suppliedHash, expectedHashBuffer)
  );
}
