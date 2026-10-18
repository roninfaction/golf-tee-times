import { createServiceClient } from "@/lib/supabase/server";
import { LOGO_OG_IMAGE } from "@/lib/og";
import type { Metadata } from "next";

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id: teeTimeId } = await params;
  const svc = createServiceClient();

  const { data: ttRaw } = await svc.from("tee_times").select("*").eq("id", teeTimeId).single();
  if (!ttRaw) return { title: "GolfPack · Results" };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tt = ttRaw as any;
  const rawDate = tt.tee_datetime ?? tt.scheduled_at;
  const dateObj = rawDate ? new Date(rawDate) : null;
  const dateStr =
    dateObj && !isNaN(dateObj.getTime())
      ? dateObj.toLocaleDateString("en-US", {
          month: "long",
          day: "numeric",
          year: "numeric",
          timeZone: "America/Los_Angeles",
        })
      : null;

  const courseName: string = tt.course_name ?? "Golf Round";
  const title = [courseName, dateStr, "Results"].filter(Boolean).join(" · ");
  const description = `View the scorecard and results from this round on GolfPack.`;

  let photoUri: string | null = null;
  if (tt.course_place_id) {
    const { data: courseRaw } = await svc
      .from("courses")
      .select("photo_uri")
      .eq("place_id", tt.course_place_id)
      .maybeSingle();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    photoUri = (courseRaw as any)?.photo_uri ?? null;
  }

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      images: photoUri
        ? [{ url: photoUri, width: 1200, height: 630, alt: courseName }]
        : [LOGO_OG_IMAGE],
    },
    twitter: {
      card: photoUri ? "summary_large_image" : "summary",
      title,
      description,
      images: [photoUri ?? LOGO_OG_IMAGE.url],
    },
  };
}

export default function ShareLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
