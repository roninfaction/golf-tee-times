// Scorecard OCR using GPT-4o Vision.
// Accepts a public or signed URL to a scorecard image.

export type OcrResult = {
  gross_score: number;
  confidence: "high" | "low";
};

export type OcrGroupPlayer = {
  player_name: string; // exact name from the provided list
  gross_score: number;
  confidence: "high" | "low";
};

// Multi-player scan: reads all player totals from one scorecard photo.
// playerNames must be the exact display names to use in the response (GPT-4o matches card names to this list).
export async function extractGroupScores(
  imageUrl: string,
  playerNames: string[]
): Promise<OcrGroupPlayer[] | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const nameList = playerNames.map(n => `- ${n}`).join("\n");

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o",
        max_tokens: 400,
        messages: [{
          role: "user",
          content: [
            { type: "image_url", image_url: { url: imageUrl, detail: "high" } },
            {
              type: "text",
              text: `This is a golf scorecard. The players in this group are (use these EXACT names in your response):\n${nameList}\n\nFor each player you can identify on the scorecard, return their 18-hole gross total (total strokes). Match names written on the card to the closest name in the list above and use the EXACT name from the list in your response. Omit any player whose total you cannot read.\n\nReturn ONLY a JSON array with no markdown:\n[{"player_name": "EXACT name from list", "gross_score": <integer>, "confidence": "high" or "low"}]\n\nUse confidence "low" if the total is unclear or you are estimating.`,
            },
          ],
        }],
      }),
    });

    if (!res.ok) return null;
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content?.trim();
    if (!content) return null;

    const parsed = JSON.parse(content) as OcrGroupPlayer[];
    return parsed.filter(p => p.gross_score >= 50 && p.gross_score <= 180);
  } catch {
    return null;
  }
}

export async function extractScoreFromScorecard(imageUrl: string): Promise<OcrResult | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        max_tokens: 100,
        messages: [
          {
            role: "user",
            content: [
              { type: "image_url", image_url: { url: imageUrl, detail: "low" } },
              {
                type: "text",
                text: 'This is a golf scorecard. Extract the total gross score (final stroke count for the full round). Return ONLY a JSON object with no markdown: {"gross_score": <integer>, "confidence": "high" or "low"}. Use "low" if the scorecard is unclear, partially visible, or you are guessing.',
              },
            ],
          },
        ],
      }),
    });

    if (!res.ok) return null;
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content?.trim();
    if (!content) return null;

    const parsed = JSON.parse(content) as OcrResult;
    if (!parsed.gross_score || parsed.gross_score < 50 || parsed.gross_score > 180) return null;

    return parsed;
  } catch {
    return null;
  }
}
