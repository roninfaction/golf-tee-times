import { createServiceClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
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
}

export async function PATCH(request: Request) {
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
}
