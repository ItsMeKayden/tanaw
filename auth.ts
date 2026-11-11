import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
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
