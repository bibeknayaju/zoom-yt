import { NextRequest, NextResponse } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";
import { getAuthContext } from "@/lib/auth";

export async function GET() {
  try {
    const auth = await getAuthContext();
    if (!auth.isAdmin) {
      return NextResponse.json({ success: false, error: "Unauthorized. Admin role required." }, { status: 403 });
    }

    const client = await clerkClient();
    const response = await client.users.getUserList({ limit: 50 });

    const adminEmails = (process.env.ADMIN_EMAILS || "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);

    const users = response.data.map((u) => {
      const email = u.emailAddresses[0]?.emailAddress || "";
      const metadataRole = (u.publicMetadata?.role as string) || "user";
      const isAdmin = metadataRole === "admin" || (email && adminEmails.includes(email.toLowerCase()));

      return {
        id: u.id,
        email,
        name: u.fullName || u.firstName || email.split("@")[0] || "User",
        imageUrl: u.imageUrl,
        role: isAdmin ? "admin" : "user",
        createdAt: u.createdAt,
      };
    });

    return NextResponse.json({ success: true, users });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to list users";
    console.error("GET /api/admin/users error:", error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthContext();
    if (!auth.isAdmin) {
      return NextResponse.json({ success: false, error: "Unauthorized. Admin role required." }, { status: 403 });
    }

    const body = await req.json();
    const { userId, role } = body;

    if (!userId || !["admin", "user"].includes(role)) {
      return NextResponse.json({ success: false, error: "Invalid userId or role" }, { status: 400 });
    }

    const client = await clerkClient();
    await client.users.updateUserMetadata(userId, {
      publicMetadata: {
        role,
      },
    });

    return NextResponse.json({
      success: true,
      message: `User role updated to ${role} successfully`,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to update user role";
    console.error("POST /api/admin/users error:", error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
