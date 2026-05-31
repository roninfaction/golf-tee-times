// Scorecard OCR using GPT-4o Vision.

export type OcrResult = {
  gross_score: number;
  confidence: "high" | "low";
  hole_scores?: Record<string, number>; // "1" → strokes, "2" → strokes, ...
};

export type OcrGroupPlayer = {
  player_name: string;
  gross_score: number;
  confidence: "high" | "low";
  hole_scores?: Record<string, number>;
};

// Multi-player scan: reads all player totals (and per-hole if visible) from one scorecard photo.
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
        max_tokens: 1200,
        messages: [{
          role: "user",
          content: [
            { type: "image_url", image_url: { url: imageUrl, detail: "high" } },
            {
              type: "text",
              text: `This is a golf scorecard. The players in this group are (use these EXACT names in your response):\n${nameList}\n\nFor each player you can identify, extract:\n1. Their 18-hole gross total (total strokes)\n2. Their individual hole scores for each hole you can read (holes 1-18)\n\nMatch names written on the card to the closest name in the list and use the EXACT name from the list.\n\nReturn ONLY a JSON array with no markdown:\n[{"player_name": "EXACT name", "gross_score": <integer>, "confidence": "high" or "low", "hole_scores": {"1": 4, "2": 5, ...}}]\n\nRules:\n- Omit any player whose total you cannot read\n- For hole_scores, only include holes where you can clearly read the stroke count\n- Use confidence "low" if the total is unclear or you are estimating\n- gross_score must be the actual total from the card (or sum of holes if total is missing)`,
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
        max_tokens: 400,
        messages: [
          {
            role: "user",
            content: [
              { type: "image_url", image_url: { url: imageUrl, detail: "high" } },
              {
                type: "text",
                text: `This is a golf scorecard. Extract the player's total gross score and their score for each individual hole.\n\nReturn ONLY a JSON object with no markdown:\n{"gross_score": <integer>, "confidence": "high" or "low", "hole_scores": {"1": 4, "2": 5, ...}}\n\nRules:\n- gross_score is the total strokes for the round\n- For hole_scores, only include holes where you can clearly read the count\n- Use confidence "low" if the scorecard is unclear or you are guessing\n- Omit hole_scores entirely if you cannot read individual holes`,
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
