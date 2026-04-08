const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? "";

export type ParsedTeeTime = {
  course_name: string;
  tee_date: string;       // YYYY-MM-DD
  tee_time: string;       // HH:MM (24h)
  holes: 9 | 18;
  confirmation_number: string | null;
  notes: string | null;
};

// Strip HTML tags and collapse whitespace
function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export async function parseTeeTimeEmail(
  emailBody: string,
  isHtml = false
): Promise<ParsedTeeTime | null> {
  const text = isHtml ? stripHtml(emailBody) : emailBody;
  const truncated = text.slice(0, 3000);

  const prompt = `You are parsing a golf course booking confirmation email to extract structured data.

Extract these fields:
- course_name: The name of the golf course (not the booking platform like GolfNow, TeeOff, Chronogolf — the actual course name)
- tee_date: Date in YYYY-MM-DD format
- tee_time: Time in HH:MM 24-hour format
- holes: Number of holes, either 9 or 18 (default to 18 if not specified)
- confirmation_number: The booking or confirmation number/code (null if not found)
- notes: Any relevant extra info like "cart included", "dress code required", "check in 30 min early" (null if nothing notable)

Return ONLY a valid JSON object with exactly these keys. Use null for fields you cannot determine with confidence. Do not include any other text.

Email:
${truncated}`;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        max_tokens: 300,
        temperature: 0,
      }),
    });

    const json = await response.json() as { choices: Array<{ message: { content: string } }> };
    const content = json.choices?.[0]?.message?.content;
    if (!content) return null;

    const parsed = JSON.parse(content) as ParsedTeeTime;

    // Validate
    if (!parsed.course_name || !parsed.tee_date || !parsed.tee_time) return null;

    // Validate date is in the future and within a year
    const teeDate = new Date(`${parsed.tee_date}T${parsed.tee_time}`);
    const now = new Date();
    const oneYearFromNow = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());
    if (teeDate <= now || teeDate > oneYearFromNow) return null;

    // Normalize holes
    parsed.holes = parsed.holes === 9 ? 9 : 18;

    return parsed;
  } catch {
    return null;
  }
}
