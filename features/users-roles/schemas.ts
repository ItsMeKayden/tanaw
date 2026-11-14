/**
 * Zod schemas for Users & Roles, shared by the React Hook Form components and
 * the server actions. Safe to import anywhere.
 */
import { z } from "zod";

import { MODULES, ROLE_NAMES } from "@/lib/modules";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const createUserSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Name must be between 2 and 150 characters.")
    .max(150, "Name must be between 2 and 150 characters."),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(150, "Email must not exceed 150 characters.")
    .regex(EMAIL_PATTERN, "Please enter a valid email address."),
  password: z
    .string()
    .min(8, "Password must be between 8 and 72 characters.")
    .max(72, "Password must be between 8 and 72 characters."),
  role: z.enum(ROLE_NAMES, { error: "Invalid user role." }),
});
export type CreateUserValues = z.input<typeof createUserSchema>;

export const ACCESS_LEVELS = ["NONE", "READ", "WRITE"] as const;
export type AccessLevel = (typeof ACCESS_LEVELS)[number];

const moduleCodes = MODULES.map((m) => m.code) as [
  (typeof MODULES)[number]["code"],
  ...(typeof MODULES)[number]["code"][],
];

/** One role's access: every module needs a level (record with enum keys is exhaustive). */
export const roleAccessSchema = z.record(
  z.enum(moduleCodes),
  z.enum(ACCESS_LEVELS, { error: "Choose an access level." }),
);

export const rolePermissionsSchema = z
  .array(z.object({ role_name: z.enum(ROLE_NAMES), access: roleAccessSchema }))
  .min(1, "Nothing to save.");
export type RolePermissionsInput = z.input<typeof rolePermissionsSchema>;

/** Form shape for the Roles & permissions editor (keyed by role name). */
export const rolePermissionsFormSchema = z.object({
  roles: z.record(z.string(), roleAccessSchema),
});
export type RolePermissionsFormValues = z.input<typeof rolePermissionsFormSchema>;
