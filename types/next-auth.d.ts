import "next-auth";
import "next-auth/jwt";
import { DefaultSession } from "next-auth";

type UserRole =
  | "SYSTEM_ADMIN"
  | "PRESIDENT"
  | "ADMISSION"
  | "REGISTRAR"
  | "GUIDANCE";

declare module "next-auth" {
  interface User {
    role: UserRole;
  }

  interface Session {
    user: {
      id: string;
      role: UserRole;
    } & NonNullable<DefaultSession["user"]>;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: UserRole;
  }
}
