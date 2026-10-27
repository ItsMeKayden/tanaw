// "use server";

// import { hash } from "bcryptjs";
// import { prisma } from "@/lib/prisma";

// type RegisterResult = {
//   success: boolean;
//   message: string;
// };

// export async function registerUser(
//   formData: FormData,
// ): Promise<RegisterResult> {
//   const name = formData.get("name");
//   const email = formData.get("email");
//   const password = formData.get("password");

//   if (
//     typeof name !== "string" ||
//     typeof email !== "string" ||
//     typeof password !== "string"
//   ) {
//     return {
//       success: false,
//       message: "Please complete all required fields.",
//     };
//   }

//   const cleanName = name.trim();
//   const cleanEmail = email.trim().toLowerCase();

//   if (cleanName.length < 2 || cleanName.length > 100) {
//     return {
//       success: false,
//       message: "Name must be between 2 and 100 characters.",
//     };
//   }

//   if (
//     cleanEmail.length > 254 ||
//     !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)
//   ) {
//     return {
//       success: false,
//       message: "Please enter a valid email address.",
//     };
//   }

//   if (password.length < 8 || password.length > 72) {
//     return {
//       success: false,
//       message: "Password must be between 8 and 72 characters.",
//     };
//   }

//   try {
//     const existingUser = await prisma.user.findUnique({
//       where: { email: cleanEmail },
//       select: { id: true },
//     });

//     if (existingUser) {
//       return {
//         success: false,
//         message: "Unable to register with that email address.",
//       };
//     }

//     const hashedPassword = await hash(password, 12);

//     await prisma.user.create({
//       data: {
//         name: cleanName,
//         email: cleanEmail,
//         password: hashedPassword,
//       },
//     });

//     return {
//       success: true,
//       message: "Account created successfully. You can now sign in.",
//     };
//   } catch (error) {
//     console.error("Registration failed:", error);

//     return {
//       success: false,
//       message: "Registration failed. Please try again.",
//     };
//   }
// }

"use server";

type RegisterResult = {
  success: boolean;
  message: string;
};

export async function registerUser(
  _formData: FormData,
): Promise<RegisterResult> {
  return {
    success: false,
    message:
      "Registration is currently closed. Please contact your system administrator.",
  };
}
