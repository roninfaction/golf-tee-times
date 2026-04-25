import { createServiceClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "");

    if (!token) {
      return NextResponse.json({ error: "unauthorized_no_token" }, { status: 401 });
    }

    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceKey) {
      return NextResponse.json({ error: "no_service_key" }, { status: 500 });
    }

    const service = createServiceClient();
    const { data: { user }, error: userError } = await service.auth.getUser(token);

    if (userError || !user) {
      return NextResponse.json({ error: `auth_failed:${userError?.message}` }, { status: 401 });
    }

    let { data, error } = await service
      .from("profiles")
      .select("display_name, forwarder_token, email, push_subscription")
      .eq("id", user.id)
      .single();

    // push_subscription column may not exist if migration 004 wasn't applied
    if (error?.message?.includes("push_subscription")) {
      const fallback = await service
        .from("profiles")
        .select("display_name, forwarder_token, email")
        .eq("id", user.id)
        .single();
      data = fallback.data as typeof data;
      error = fallback.error;
    }

    // PGRST116 = no rows returned — profile genuinely missing, safe to create
    // Any other error (network, schema, etc.) — return the error, do NOT overwrite
    if (error?.code === "PGRST116" || (!error && !data)) {
      // Insert only — never update an existing row (ignoreDuplicates prevents overwriting display_name)
      await service.from("profiles").upsert(
        { id: user.id, email: user.email ?? "", display_name: (user.email ?? "").split("@")[0] },
        { onConflict: "id", ignoreDuplicates: true }
      );
      const { data: newData } = await service
        .from("profiles")
        .select("display_name, forwarder_token, email")
        .eq("id", user.id)
        .single();
      return NextResponse.json(newData ?? {});
    }

    if (error) {
      return NextResponse.json({ error: `select_failed:${error.message}` }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (e: unknown) {
    return NextResponse.json({ error: `crashed:${e instanceof Error ? e.message : String(e)}` }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const authHeader = request.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "");

    if (!token) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const service = createServiceClient();
    const { data: { user }, error: userError } = await service.auth.getUser(token);

    if (userError || !user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updates: Record<string, any> = {};
    if (body.display_name !== undefined) updates.display_name = body.display_name;
    if (body.avatar_url !== undefined) updates.avatar_url = body.avatar_url;

    const { data: updated, error: updateError } = await service
      .from("profiles")
      .update(updates)
      .eq("id", user.id)
      .select("id");
    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }
    if (!updated || updated.length === 0) {
      const { error: upsertError } = await service.from("profiles").upsert({
        id: user.id,
        email: user.email ?? "",
        ...updates,
      });
      if (upsertError) {
        return NextResponse.json({ error: upsertError.message }, { status: 500 });
      }
    }
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return NextResponse.json({ error: `crashed:${e instanceof Error ? e.message : String(e)}` }, { status: 500 });
  }
}
