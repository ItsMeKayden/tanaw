import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { recordAuditEvent } from "@/lib/audit";

const validRoles = [
  "SYSTEM_ADMIN",
  "PRESIDENT",
  "ADMISSION",
  "REGISTRAR",
  "GUIDANCE",
] as const;

export const { handlers, signIn, signOut, auth } = NextAuth({
  secret: process.env.AUTH_SECRET,

  session: {
    strategy: "jwt",
  },

  pages: {
    signIn: "/auth/login",
  },

  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },

      async authorize(credentials) {
        if (
          typeof credentials?.email !== "string" ||
          typeof credentials?.password !== "string"
        ) {
          return null;
        }

        const email = credentials.email.trim().toLowerCase();

        const user = await prisma.tbl_user_account.findFirst({
          where: { email },
          include: {
            tbl_role: true,
          },
        });

        const failed = async (reason: string) => {
          await recordAuditEvent({
            action: "LOGIN_FAILED",
            description: `Failed sign-in for ${email}: ${reason}.`,
            actor: user
              ? { id: user.user_id, name: user.full_name, email: user.email, role: user.tbl_role?.role_name }
              : { email },
          });
          return null;
        };

        if (!user) return failed("no account with this email");
        if (user.is_active !== true) return failed("account is inactive");
        if (!user.tbl_role) return failed("account has no role");

        const role = user.tbl_role.role_name;

        if (!validRoles.includes(role as (typeof validRoles)[number])) {
          return failed("account has an unknown role");
        }

        const passwordMatches = await bcrypt.compare(
          credentials.password,
          user.password_hash,
        );

        if (!passwordMatches) {
          return failed("wrong password");
        }

        return {
          id: String(user.user_id),
          name: user.full_name,
          email: user.email,
          role: role as (typeof validRoles)[number],
        };
      },
    }),
  ],

  // Sign-ins and sign-outs go to the audit log (row changes are logged by
  // database triggers).
  events: {
    async signIn({ user }) {
      await recordAuditEvent({
        action: "LOGIN",
        description: `${user.name ?? user.email ?? "A user"} signed in.`,
        actor: user,
      });
    },

    async signOut(message) {
      const token = "token" in message ? message.token : null;
      await recordAuditEvent({
        action: "LOGOUT",
        description: `${token?.name ?? token?.email ?? "A user"} signed out.`,
        actor: token
          ? {
              id: token.sub,
              name: token.name,
              email: token.email,
              role: typeof token.role === "string" ? token.role : null,
            }
          : undefined,
      });
    },
  },

  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role;
      }

      return token;
    },

    async session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;

        if (
          typeof token.role === "string" &&
          validRoles.includes(token.role as (typeof validRoles)[number])
        ) {
          session.user.role = token.role as (typeof validRoles)[number];
        }
      }

      return session;
    },
  },
});
