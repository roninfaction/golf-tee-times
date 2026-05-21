const RESEND_API_KEY = process.env.RESEND_API_KEY ?? "";
const FROM = "GolfPack <noreply@golfpack.app>";

export async function sendEmail({ to, subject, html }: { to: string; subject: string; html: string }) {
  if (!RESEND_API_KEY) {
    console.error("RESEND_API_KEY not configured");
    return false;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: FROM, to, subject, html }),
  });
  if (!res.ok) console.error("Resend error:", await res.text());
  return res.ok;
}

export function guestReminderHtml({
  guestName,
  courseName,
  teeDate,
  teeTime,
  holes,
  groupName,
  label,
}: {
  guestName: string;
  courseName: string;
  teeDate: string;
  teeTime: string;
  holes: number;
  groupName: string;
  label: "tomorrow" | "in 2 hours";
}) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;padding:32px 16px">
    <tr><td align="center">
      <table width="100%" style="max-width:480px;background:#1e293b;border-radius:16px;padding:32px;border:1px solid #334155">
        <tr><td style="text-align:center;padding-bottom:24px">
          <div style="font-size:40px">⛳</div>
          <h1 style="margin:12px 0 4px;color:#f8fafc;font-size:22px;font-weight:700">Tee time ${label}!</h1>
          <p style="margin:0;color:#94a3b8;font-size:14px">Hey ${guestName}, don't forget you're up</p>
        </td></tr>
        <tr><td style="background:#0f172a;border-radius:12px;padding:20px;margin-bottom:24px">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="color:#64748b;font-size:12px;padding-bottom:4px">COURSE</td>
            </tr>
            <tr>
              <td style="color:#f8fafc;font-size:18px;font-weight:600;padding-bottom:16px">${courseName}</td>
            </tr>
            <tr>
              <td style="color:#64748b;font-size:12px;padding-bottom:4px">DATE &amp; TIME</td>
            </tr>
            <tr>
              <td style="color:#f8fafc;font-size:16px;padding-bottom:16px">${teeDate} at ${teeTime}</td>
            </tr>
            <tr>
              <td style="color:#64748b;font-size:12px;padding-bottom:4px">GROUP</td>
            </tr>
            <tr>
              <td style="color:#f8fafc;font-size:16px;padding-bottom:16px">${groupName}</td>
            </tr>
            <tr>
              <td style="color:#64748b;font-size:12px;padding-bottom:4px">HOLES</td>
            </tr>
            <tr>
              <td style="color:#f8fafc;font-size:16px">${holes}</td>
            </tr>
          </table>
        </td></tr>
        <tr><td style="padding-top:24px;text-align:center">
          <p style="margin:0;color:#64748b;font-size:13px">See you out there! 🏌️</p>
        </td></tr>
      </table>
      <p style="color:#475569;font-size:12px;margin-top:16px">You received this because you accepted a GolfPack invite.</p>
    </td></tr>
  </table>
</body>
</html>`;
}
