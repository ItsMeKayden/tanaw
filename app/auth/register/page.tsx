// "use client";

// import { useState } from "react";
// import Link from "next/link";
// import { useRouter } from "next/navigation";
// import { registerUser } from "@/features/auth/actions/register";
// import { Button } from "@/components/ui/button";
// import { Input } from "@/components/ui/input";
// import { Label } from "@/components/ui/label";
// import {
//   Card,
//   CardContent,
//   CardDescription,
//   CardHeader,
//   CardTitle,
// } from "@/components/ui/card";

// export default function RegisterPage() {
//   const router = useRouter();
//   const [error, setError] = useState("");
//   const [loading, setLoading] = useState(false);

//   async function handleSubmit(formData: FormData) {
//     setError("");
//     setLoading(true);

//     try {
//       const result = await registerUser(formData);

//       if (result.success) {
//         router.push("/auth/login?registered=true");
//         router.refresh();
//         return;
//       }

//       setError(result.message);
//     } catch {
//       setError("Something went wrong. Please try again.");
//     } finally {
//       setLoading(false);
//     }
//   }

//   return (
//     <main className="flex min-h-screen items-center justify-center bg-muted/40 px-4 py-10">
//       <Card className="w-full max-w-md">
//         <CardHeader className="space-y-2 text-center">
//           <p className="text-sm font-semibold tracking-[0.2em] text-primary">
//             TANAW
//           </p>
//           <CardTitle className="text-2xl">Create an account</CardTitle>
//           <CardDescription>
//             Register to access the admission tracking system.
//           </CardDescription>
//         </CardHeader>

//         <CardContent>
//           <form action={handleSubmit} className="space-y-5">
//             <div className="space-y-2">
//               <Label htmlFor="name">Full name</Label>
//               <Input
//                 id="name"
//                 name="name"
//                 type="text"
//                 autoComplete="name"
//                 placeholder="Enter your full name"
//                 minLength={2}
//                 maxLength={100}
//                 required
//               />
//             </div>

//             <div className="space-y-2">
//               <Label htmlFor="email">Email address</Label>
//               <Input
//                 id="email"
//                 name="email"
//                 type="email"
//                 autoComplete="email"
//                 placeholder="you@example.com"
//                 maxLength={254}
//                 required
//               />
//             </div>

//             <div className="space-y-2">
//               <Label htmlFor="password">Password</Label>
//               <Input
//                 id="password"
//                 name="password"
//                 type="password"
//                 autoComplete="new-password"
//                 placeholder="At least 8 characters"
//                 minLength={8}
//                 maxLength={72}
//                 required
//               />
//             </div>

//             {error && (
//               <p
//                 role="alert"
//                 className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
//               >
//                 {error}
//               </p>
//             )}

//             <Button type="submit" className="w-full" disabled={loading}>
//               {loading ? "Creating account..." : "Create account"}
//             </Button>
//           </form>

//           <p className="mt-6 text-center text-sm text-muted-foreground">
//             Already have an account?{" "}
//             <Link
//               href="/auth/login"
//               className="font-medium text-primary underline-offset-4 hover:underline"
//             >
//               Sign in
//             </Link>
//           </p>
//         </CardContent>
//       </Card>
//     </main>
//   );
// }

import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function RegisterPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-2 text-center">
          <p className="text-sm font-semibold tracking-[0.2em] text-primary">
            TANAW
          </p>

          <CardTitle className="text-2xl">Registration Closed</CardTitle>

          <CardDescription>
            TANAW accounts are available only to authorized staff. Please
            contact your system administrator if you need an account.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <Link
            href="/auth/login"
            className="flex w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Back to Sign In
          </Link>
        </CardContent>
      </Card>
    </main>
  );
}
