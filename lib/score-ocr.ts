// Scorecard OCR using GPT-4o Vision.
// Accepts a public or signed URL to a scorecard image.

export type OcrResult = {
  gross_score: number;
  confidence: "high" | "low";
};

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
