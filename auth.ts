import { randomUUID } from "node:crypto";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import {
  SESSION_MAX_AGE_MS,
  SESSION_MAX_AGE_SECONDS,
} from "@/lib/session-policy";
import bcrypt from "bcryptjs";

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
    maxAge: SESSION_MAX_AGE_SECONDS,
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

        if (!user || user.is_active !== true || !user.tbl_role) {
          return null;
        }

        const role = user.tbl_role.role_name;

        if (!validRoles.includes(role as (typeof validRoles)[number])) {
          return null;
        }

        const passwordMatches = await bcrypt.compare(
          credentials.password,
          user.password_hash,
        );

        if (!passwordMatches) {
          return null;
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

  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        const userId = Number(user.id);
        if (!Number.isSafeInteger(userId) || userId <= 0) {
          throw new Error("Cannot create a session for an invalid account.");
        }

        const sessionId = randomUUID();
        const now = new Date();
        const expiresAt = now.getTime() + SESSION_MAX_AGE_MS;
        await prisma.tbl_auth_session.create({
          data: {
            session_id: sessionId,
            user_id: userId,
            expires_at: new Date(expiresAt),
          },
        });

        token.sessionId = sessionId;
        token.sessionExpiresAt = expiresAt;
        token.lastActivityAt = now.getTime();
        token.role = user.role;
        return token;
      }

      if (typeof token.sessionId !== "string") return null;

      const now = new Date();
      const { count } = await prisma.tbl_auth_session.updateMany({
        where: {
          session_id: token.sessionId,
          expires_at: { gt: now },
          user: { is: { is_active: true } },
        },
        data: { last_activity_at: now },
      });

      if (count === 0) {
        await prisma.tbl_auth_session.deleteMany({
          where: {
            session_id: token.sessionId,
            expires_at: { lte: now },
          },
        });
        return null;
      }

      token.lastActivityAt = now.getTime();
      return token;
    },

    async session({ session, token }) {
      if (typeof token.sessionExpiresAt === "number") {
        session.absoluteExpiresAt = new Date(token.sessionExpiresAt).toISOString();
      }
      if (typeof token.lastActivityAt === "number") {
        session.lastActivityAt = new Date(token.lastActivityAt).toISOString();
      }

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

  events: {
    async signOut(message) {
      if ("token" in message && typeof message.token?.sessionId === "string") {
        await prisma.tbl_auth_session.deleteMany({
          where: { session_id: message.token.sessionId },
        });
      }
    },
  },
});
