const ONESIGNAL_APP_ID = process.env.ONESIGNAL_APP_ID ?? "";
const ONESIGNAL_REST_API_KEY = process.env.ONESIGNAL_REST_API_KEY ?? "";

export async function sendPush({
  playerIds,
  title,
  body,
  data,
}: {
  playerIds: string[];
  title: string;
  body: string;
  data?: Record<string, string>;
}) {
  if (!playerIds.length || !ONESIGNAL_REST_API_KEY) return;

  await fetch("https://onesignal.com/api/v1/notifications", {
    method: "POST",
    headers: {
      Authorization: `Basic ${ONESIGNAL_REST_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      app_id: ONESIGNAL_APP_ID,
      include_player_ids: playerIds,
      headings: { en: title },
      contents: { en: body },
      data: data ?? {},
    }),
  });
}
