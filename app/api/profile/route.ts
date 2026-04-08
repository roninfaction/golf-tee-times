import { createServiceClient } from "@/lib/supabase/server";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const service = createServiceClient();
  const { data, error } = await service
    .from("profiles")
    .select("display_name, forwarder_token, email")
    .eq("id", user.id)
    .single();

  if (error || !data) {
    // Auto-create profile if missing
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
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { display_name } = await request.json();
  const service = createServiceClient();
  await service.from("profiles").update({ display_name }).eq("id", user.id);
  return NextResponse.json({ ok: true });
}
