// GHIN Handicap API integration
// API key required: register at ghin.com/api and set GHIN_API_KEY env var.
// Without the key, fetchHandicapByGhinNumber returns null gracefully.

const GHIN_BASE = "https://api2.ghin.com/api/v1";

export async function fetchHandicapByGhinNumber(ghinNumber: string): Promise<number | null> {
  const apiKey = process.env.GHIN_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch(
      `${GHIN_BASE}/golfers/search?per_page=1&page=1&golfer_id=${encodeURIComponent(ghinNumber)}`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        next: { revalidate: 0 }, // always fresh
      }
    );

    if (!res.ok) return null;
    const data = await res.json();

    // GHIN response: { golfers: [{ golfing_profile: { handicap_index: number } }] }
    const handicap = data?.golfers?.[0]?.golfing_profile?.handicap_index;
    if (handicap === undefined || handicap === null) return null;

    return parseFloat(handicap);
  } catch {
    return null;
  }
}
