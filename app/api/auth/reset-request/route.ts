import { createServiceClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/resend";
import { NextResponse } from "next/server";

const SITE_URL = "https://golfpack.app";

function resetEmailHtml(link: string) {
  return `
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;color:#111">
    <div style="text-align:center;margin-bottom:24px">
      <div style="font-size:40px">⛳</div>
      <h1 style="font-size:22px;margin:8px 0 0">GolfPack</h1>
    </div>
    <p style="font-size:15px;line-height:1.5">Someone (hopefully you) asked to reset the password for this GolfPack account.</p>
    <p style="font-size:15px;line-height:1.5">Tap the button below to choose a new password. This link expires in 1 hour and can only be used once.</p>
    <div style="text-align:center;margin:28px 0">
      <a href="${link}" style="display:inline-block;background:#30D158;color:#000;font-weight:600;font-size:16px;text-decoration:none;padding:14px 28px;border-radius:14px">Reset my password</a>
    </div>
    <p style="font-size:13px;line-height:1.5;color:#666">If you didn't request this, you can safely ignore this email — your password won't change.</p>
    <p style="font-size:12px;color:#999;margin-top:24px;word-break:break-all">Or paste this link into your browser:<br>${link}</p>
  </div>`;
}

export async function POST(request: Request) {
  try {
    const { email } = (await request.json()) as { email?: string };
    const clean = (email ?? "").trim().toLowerCase();

    // Basic shape check; always respond ok below to avoid leaking which emails exist.
    if (clean && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean)) {
      const service = createServiceClient();
      const { data, error } = await service.auth.admin.generateLink({
        type: "recovery",
        email: clean,
      });

      const hashedToken = data?.properties?.hashed_token;
      if (!error && hashedToken) {
        const link = `${SITE_URL}/reset-password?token_hash=${hashedToken}&type=recovery`;
        await sendEmail({
          to: clean,
          subject: "Reset your GolfPack password",
          html: resetEmailHtml(link),
        });
      } else if (error && !/user not found|not found|no user/i.test(error.message)) {
        // Log unexpected errors, but still return ok to the client.
        console.error("reset-request generateLink error:", error.message);
      }
    }

    // Uniform response regardless of whether the account exists.
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("reset-request error:", e);
    // Still return ok — never reveal internal state to an unauthenticated caller.
    return NextResponse.json({ ok: true });
  }
}
