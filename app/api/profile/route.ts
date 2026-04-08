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

    const { data, error } = await service
      .from("profiles")
      .select("display_name, forwarder_token, email")
      .eq("id", user.id)
      .single();

    if (error || !data) {
      await service.from("profiles").insert({
        id: user.id,
        email: user.email ?? "",
        display_name: (user.email ?? "").split("@")[0],
      });
      const { data: newData } = await service
        .from("profiles")
        .select("display_name, forwarder_token, email")
        .eq("id", user.id)
        .single();
      return NextResponse.json(newData ?? {});
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

    const { display_name } = await request.json();
    await service.from("profiles").update({ display_name }).eq("id", user.id);
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return NextResponse.json({ error: `crashed:${e instanceof Error ? e.message : String(e)}` }, { status: 500 });
  }
}
