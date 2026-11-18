/**
 * Zod schemas for User Management, shared by the React Hook Form components and
 * the server actions. Safe to import anywhere.
 */
import { z } from "zod";

import { MODULES, ROLE_NAMES } from "@/lib/modules";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const nameField = z
  .string()
  .trim()
  .min(2, "Name must be between 2 and 150 characters.")
  .max(150, "Name must be between 2 and 150 characters.");

const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .max(150, "Email must not exceed 150 characters.")
  .regex(EMAIL_PATTERN, "Please enter a valid email address.");

const passwordField = z
  .string()
  .min(8, "Password must be between 8 and 72 characters.")
  .max(72, "Password must be between 8 and 72 characters.");

const roleField = z.enum(ROLE_NAMES, { error: "Invalid user role." });

const passwordsMatch = (values: { password: string; confirmPassword: string }) =>
  values.password === values.confirmPassword;
const mismatch = { message: "Passwords do not match.", path: ["confirmPassword"] };

export const createUserSchema = z
  .object({
    name: nameField,
    email: emailField,
    password: passwordField,
    confirmPassword: z.string(),
    role: roleField,
    isActive: z.boolean(),
  })
  .refine(passwordsMatch, mismatch);
export type CreateUserValues = z.input<typeof createUserSchema>;

/** Editing an account. A blank password keeps the current one. */
const updateUserFields = {
  name: nameField,
  email: emailField,
  password: z.union([z.literal(""), passwordField]),
  confirmPassword: z.string(),
  role: roleField,
  isActive: z.boolean(),
};

/** Edit form (the account id is not a form field). */
export const updateUserFormSchema = z.object(updateUserFields).refine(passwordsMatch, mismatch);

export const updateUserSchema = z
  .object({ userId: z.number().int().positive(), ...updateUserFields })
  .refine(passwordsMatch, mismatch);
export type UpdateUserValues = z.input<typeof updateUserSchema>;

/** Editable role details. The role code (role_name) never changes. */
export const roleDetailsSchema = z.object({
  role_name: roleField,
  display_name: z
    .string()
    .trim()
    .min(2, "Name must be between 2 and 100 characters.")
    .max(100, "Name must be between 2 and 100 characters."),
  description: z.string().trim().max(300, "Description must not exceed 300 characters."),
});
export type RoleDetailsValues = z.input<typeof roleDetailsSchema>;

export const changeUserRoleSchema = z.object({
  userId: z.number().int().positive(),
  role: roleField,
});

export const ACCESS_LEVELS =["NONE", "READ", "WRITE"] as const;
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
