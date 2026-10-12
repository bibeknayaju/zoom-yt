import { auth, currentUser } from "@clerk/nextjs/server";

export type UserRole = "admin" | "user";

export interface AuthContext {
  userId: string | null;
  userEmail: string | null;
  userName: string | null;
  role: UserRole;
  isAdmin: boolean;
}

/**
 * Reads the current authenticated user's ID, email, and determines their role.
 * Role is resolved in order:
 * 1. Clerk user.publicMetadata.role ("admin" | "user")
 * 2. ADMIN_EMAILS environment variable (comma-separated list of admin emails)
 * 3. Default fallback: "user"
 */
export async function getAuthContext(): Promise<AuthContext> {
  const { userId } = await auth();

  if (!userId) {
    return {
      userId: null,
      userEmail: null,
      userName: null,
      role: "user",
      isAdmin: false,
    };
  }

  const user = await currentUser();
  const primaryEmail =
    user?.emailAddresses?.find((e) => e.id === user.primaryEmailAddressId)?.emailAddress ||
    user?.emailAddresses?.[0]?.emailAddress ||
    null;

  const adminEmails = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  const metadataRole = (user?.publicMetadata?.role as string)?.toLowerCase();
  const isAdmin =
    metadataRole === "admin" ||
    (primaryEmail ? adminEmails.includes(primaryEmail.toLowerCase()) : false);

  const role: UserRole = isAdmin ? "admin" : "user";
  const userName = user?.fullName || user?.firstName || primaryEmail?.split("@")[0] || "User";

  return {
    userId,
    userEmail: primaryEmail,
    userName,
    role,
    isAdmin,
  };
}
