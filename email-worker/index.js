import PostalMime from "postal-mime";

export default {
  async email(message, env, ctx) {
    // Parse the raw email
    const rawEmail = await new Response(message.raw).arrayBuffer();
    const parser = new PostalMime();
    const parsed = await parser.parse(rawEmail);

    // Build payload matching our webhook format
    const payload = {
      to: message.to,
      from: message.from,
      subject: parsed.subject ?? "",
      text: parsed.text ?? "",
      html: parsed.html ?? "",
    };

    // Forward to our app webhook
    const response = await fetch(env.APP_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-webhook-secret": env.WEBHOOK_SECRET,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Webhook failed: ${response.status}`);
    }
  },
};
