import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { decryptToken } from "@/lib/crypto";
import { verifyZoomS2SConnection } from "@/lib/zoom-s2s";
import fs from "node:fs/promises";
import path from "node:path";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, accountId, clientId, clientSecret } = body;

    let targetAccountId = accountId;
    let targetClientId = clientId;
    let targetClientSecret = clientSecret;

    // If testing an existing saved account ID
    if (id) {
      const supabase = getSupabase();
      let accountRow: any = null;

      if (supabase) {
        const { data } = await supabase.from("zy_zoom_accounts").select("*").eq("id", id).maybeSingle();
        accountRow = data;
      }

      if (!accountRow) {
        return NextResponse.json({ success: false, error: "Account not found" }, { status: 404 });
      }

      targetAccountId = accountRow.account_id;
      targetClientId = decryptToken(accountRow.client_id_enc);
      targetClientSecret = decryptToken(accountRow.client_secret_enc);
    }

    if (!targetAccountId || !targetClientId || !targetClientSecret) {
      return NextResponse.json({ success: false, error: "Missing Zoom credentials" }, { status: 400 });
    }

    const result = await verifyZoomS2SConnection(targetAccountId, targetClientId, targetClientSecret);

    return NextResponse.json({
      success: result.success,
      usersCount: result.usersCount,
      sampleUsers: result.sampleUsers.map((u) => ({
        id: u.id,
        email: u.email,
        name: `${u.first_name || ""} ${u.last_name || ""}`.trim(),
      })),
      error: result.error,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Test failed";
    console.error("POST /api/zoom-youtube/zoom/test error:", error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
