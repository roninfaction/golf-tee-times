const API_KEY = process.env.GOOGLE_PLACES_API_KEY ?? "";
const BASE = "https://places.googleapis.com/v1";

export type PlaceSuggestion = {
  placeId: string;
  name: string;
  address: string;
};

export type CourseDetails = {
  place_id: string;
  name: string;
  address: string | null;
  phone: string | null;
  website: string | null;
  maps_url: string | null;
  lat: number | null;
  lng: number | null;
  photo_uri: string | null;
};

async function fetchPhotoUri(photoName: string): Promise<string | null> {
  try {
    const res = await fetch(`${BASE}/${photoName}/media?maxWidthPx=1200&skipHttpRedirect=true`, {
      headers: { "X-Goog-Api-Key": API_KEY },
    });
    if (!res.ok) return null;
    const json = await res.json() as { photoUri?: string };
    return json.photoUri ?? null;
  } catch {
    return null;
  }
}

type PlaceResult = {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  types?: string[];
  nationalPhoneNumber?: string;
  websiteUri?: string;
  googleMapsUri?: string;
  location?: { latitude?: number; longitude?: number };
  photos?: Array<{ name: string }>;
};

async function searchText(textQuery: string, fieldMask: string, includedType?: string): Promise<PlaceResult[]> {
  const res = await fetch(`${BASE}/places:searchText`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": API_KEY,
      "X-Goog-FieldMask": fieldMask,
    },
    body: JSON.stringify({ textQuery, maxResultCount: 10, ...(includedType ? { includedType } : {}) }),
  });
  if (!res.ok) return [];
  const json = await res.json() as { places?: PlaceResult[] };
  return json.places ?? [];
}

const GOLF_NAME = /golf|country club|links/i;

// Google tags some real courses only as sports_club (Elkhorn Golf Club in Stockton is one),
// so a golf_course-typed search never returns them. Run an untyped search alongside it and
// keep the untyped hits that are golf by type or by name; those are the closest text matches,
// so they go first.
async function searchGolfPlaces(name: string, fieldMask: string): Promise<PlaceResult[]> {
  const textQuery = `${name} golf course`;
  const mask = `${fieldMask},places.types`;
  const [untyped, typed] = await Promise.all([
    searchText(textQuery, mask),
    searchText(textQuery, mask, "golf_course"),
  ]);
  const golfy = untyped.filter((p) => p.types?.includes("golf_course") || GOLF_NAME.test(p.displayName?.text ?? ""));
  const seen = new Set<string>();
  return [...golfy, ...typed]
    .filter((p) => !!p.id && !seen.has(p.id) && !!seen.add(p.id))
    .slice(0, 10);
}

export async function autocompleteCourse(input: string): Promise<PlaceSuggestion[]> {
  if (!input || input.length < 2) return [];

  // Try searchText first — returns more local results via server IP geo
  try {
    const places = await searchGolfPlaces(input, "places.id,places.displayName,places.formattedAddress");
    if (places.length > 0) {
      return places
        .map((p) => (!p.id || !p.displayName?.text ? null : { placeId: p.id, name: p.displayName.text, address: p.formattedAddress ?? "" }))
        .filter((s): s is PlaceSuggestion => !!s);
    }
  } catch { /* fall through to autocomplete */ }

  // Fallback: autocomplete (max 5, global bias)
  const res = await fetch(`${BASE}/places:autocomplete`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": API_KEY,
    },
    body: JSON.stringify({
      input,
      includedPrimaryTypes: ["golf_course"],
      languageCode: "en",
    }),
  });

  if (!res.ok) return [];

  const json = await res.json() as {
    suggestions?: Array<{
      placePrediction?: {
        placeId: string;
        structuredFormat?: {
          mainText?: { text: string };
          secondaryText?: { text: string };
        };
      };
    }>;
  };

  return (json.suggestions ?? [])
    .map((s) => {
      const p = s.placePrediction;
      if (!p) return null;
      return {
        placeId: p.placeId,
        name: p.structuredFormat?.mainText?.text ?? "",
        address: p.structuredFormat?.secondaryText?.text ?? "",
      };
    })
    .filter((s): s is PlaceSuggestion => !!s && !!s.name);
}

export async function getPlaceDetails(placeId: string): Promise<CourseDetails | null> {
  const fields = "id,displayName,formattedAddress,nationalPhoneNumber,websiteUri,googleMapsUri,location,photos";
  const res = await fetch(`${BASE}/places/${placeId}`, {
    headers: {
      "X-Goog-Api-Key": API_KEY,
      "X-Goog-FieldMask": fields,
    },
  });

  if (!res.ok) return null;

  const p = await res.json() as {
    id?: string;
    displayName?: { text?: string };
    formattedAddress?: string;
    nationalPhoneNumber?: string;
    websiteUri?: string;
    googleMapsUri?: string;
    location?: { latitude?: number; longitude?: number };
    photos?: Array<{ name: string }>;
  };

  const photo_uri = p.photos?.[0]?.name ? await fetchPhotoUri(p.photos[0].name) : null;

  return {
    place_id: p.id ?? placeId,
    name: p.displayName?.text ?? "",
    address: p.formattedAddress ?? null,
    phone: p.nationalPhoneNumber ?? null,
    website: p.websiteUri ?? null,
    maps_url: p.googleMapsUri ?? null,
    lat: p.location?.latitude ?? null,
    lng: p.location?.longitude ?? null,
    photo_uri,
  };
}

export async function searchCourseByName(courseName: string): Promise<CourseDetails | null> {
  const fields = "places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.googleMapsUri,places.location,places.photos";
  const places = await searchGolfPlaces(courseName, fields);

  const p = places[0];
  if (!p?.id) return null;

  const photo_uri = p.photos?.[0]?.name ? await fetchPhotoUri(p.photos[0].name) : null;

  return {
    place_id: p.id,
    name: p.displayName?.text ?? courseName,
    address: p.formattedAddress ?? null,
    phone: p.nationalPhoneNumber ?? null,
    website: p.websiteUri ?? null,
    maps_url: p.googleMapsUri ?? null,
    lat: p.location?.latitude ?? null,
    lng: p.location?.longitude ?? null,
    photo_uri,
  };
}
