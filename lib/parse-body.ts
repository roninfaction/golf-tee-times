import { NextRequest, NextResponse } from "next/server";

/** Safely parse a JSON request body. Returns null and a 400 response on malformed input. */
export async function parseBody<T>(
  request: NextRequest
): Promise<{ body: T; badRequest: null } | { body: null; badRequest: NextResponse }> {
  try {
    const body = await request.json() as T;
    return { body, badRequest: null };
  } catch {
    return {
      body: null,
      badRequest: NextResponse.json({ error: "Invalid request body" }, { status: 400 }),
    };
  }
}
