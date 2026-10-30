import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { encryptToken, decryptToken } from "@/lib/crypto";
import { verifyZoomS2SConnection } from "@/lib/zoom-s2s";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function GET() {
  const supabase = getSupabase();
  try {
    let accounts: any[] = [];
    if (supabase) {
      const { data, error } = await supabase
        .from("zy_zoom_accounts")
        .select("*")
        .order("created_at", { ascending: false });
      if (!error && data) {
        accounts = data;
      }
    }

    // Mask secrets before sending to client
    const safeAccounts = accounts.map((acc) => ({
      id: acc.id,
      accountName: acc.account_name,
      accountId: acc.account_id,
      isActive: acc.is_active,
      createdAt: acc.created_at,
    }));

    return NextResponse.json({ success: true, accounts: safeAccounts });
  } catch (error) {
    console.error("GET /api/zoom-youtube/zoom/accounts error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { accountName, accountId, clientId, clientSecret } = body;

    if (!accountName || !accountId || !clientId || !clientSecret) {
      return NextResponse.json(
        { success: false, error: "All fields are required (accountName, accountId, clientId, clientSecret)" },
        { status: 400 }
      );
    }

    // 1. Verify credentials with Zoom live before storing
    const testResult = await verifyZoomS2SConnection(accountId, clientId, clientSecret);
    if (!testResult.success) {
      return NextResponse.json(
        { success: false, error: `Zoom authentication failed: ${testResult.error}` },
        { status: 400 }
      );
    }

    // 2. Encrypt credentials
    const clientIdEnc = encryptToken(clientId);
    const clientSecretEnc = encryptToken(clientSecret);

    const supabase = getSupabase();
    let savedAccount: any = null;

    if (supabase) {
      const { data, error } = await supabase.from("zy_zoom_accounts").insert({
        account_name: accountName,
        account_id: accountId,
        client_id_enc: clientIdEnc,
        client_secret_enc: clientSecretEnc,
        is_active: true,
      }).select().single();

      if (error) {
        throw new Error(error.message);
      }
      savedAccount = data;
    }

    return NextResponse.json({
      success: true,
      message: `Zoom account "${accountName}" connected successfully! Found ${testResult.usersCount} users.`,
      usersCount: testResult.usersCount,
      account: {
        id: savedAccount?.id,
        accountName,
        accountId,
        isActive: true,
      },
    });
  } catch (error: any) {
    console.error("POST /api/zoom-youtube/zoom/accounts error:", error);
    return NextResponse.json({ success: false, error: error?.message || "Failed to connect Zoom account" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, accountName, accountId, clientId, clientSecret, isActive } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: "Account id is required" }, { status: 400 });
    }

    const supabase = getSupabase();
    if (!supabase) {
      return NextResponse.json({ success: false, error: "Database not configured" }, { status: 500 });
    }

    const { data: existing, error: fetchErr } = await supabase
      .from("zy_zoom_accounts")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (fetchErr || !existing) {
      return NextResponse.json({ success: false, error: "Account not found" }, { status: 404 });
    }

    const updatePayload: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (accountName !== undefined && accountName.trim()) {
      updatePayload.account_name = accountName.trim();
    }

    if (isActive !== undefined) {
      updatePayload.is_active = Boolean(isActive);
    }

    // Determine final credentials to verify
    const finalAccountId = (accountId && accountId.trim()) ? accountId.trim() : existing.account_id;
    const finalClientId = (clientId && clientId.trim()) ? clientId.trim() : decryptToken(existing.client_id_enc);
    const finalClientSecret = (clientSecret && clientSecret.trim()) ? clientSecret.trim() : decryptToken(existing.client_secret_enc);

    // If credentials or accountId are changed, verify with Zoom live
    const isCredentialsChanged = Boolean(
      (accountId && accountId.trim() !== existing.account_id) ||
      (clientId && clientId.trim()) ||
      (clientSecret && clientSecret.trim())
    );

    if (isCredentialsChanged) {
      const testResult = await verifyZoomS2SConnection(finalAccountId, finalClientId, finalClientSecret);
      if (!testResult.success) {
        return NextResponse.json(
          { success: false, error: `Zoom authentication failed: ${testResult.error}` },
          { status: 400 }
        );
      }

      updatePayload.account_id = finalAccountId;
      updatePayload.client_id_enc = encryptToken(finalClientId);
      updatePayload.client_secret_enc = encryptToken(finalClientSecret);
    }

    const { data: updated, error: updErr } = await supabase
      .from("zy_zoom_accounts")
      .update(updatePayload)
      .eq("id", id)
      .select()
      .single();

    if (updErr) {
      throw new Error(updErr.message);
    }

    return NextResponse.json({
      success: true,
      message: `Zoom account "${updated.account_name}" updated successfully!`,
      account: {
        id: updated.id,
        accountName: updated.account_name,
        accountId: updated.account_id,
        isActive: updated.is_active,
        createdAt: updated.created_at,
        updatedAt: updated.updated_at,
      },
    });
  } catch (error: any) {
    console.error("PUT /api/zoom-youtube/zoom/accounts error:", error);
    return NextResponse.json({ success: false, error: error?.message || "Failed to update Zoom account" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ success: false, error: "id parameter is required" }, { status: 400 });
    }

    const supabase = getSupabase();
    if (supabase) {
      const { error } = await supabase.from("zy_zoom_accounts").delete().eq("id", id);
      if (error) {
        throw new Error(error.message);
      }
    }

    return NextResponse.json({ success: true, message: "Zoom account removed" });
  } catch (error: any) {
    console.error("DELETE /api/zoom-youtube/zoom/accounts error:", error);
    return NextResponse.json({ success: false, error: error?.message || "Internal server error" }, { status: 500 });
  }
}
