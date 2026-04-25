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

export async function autocompleteCourse(input: string): Promise<PlaceSuggestion[]> {
  if (!input || input.length < 2) return [];

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
  const res = await fetch(`${BASE}/places:searchText`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": API_KEY,
      "X-Goog-FieldMask": fields,
    },
    body: JSON.stringify({
      textQuery: `${courseName} golf course`,
      includedType: "golf_course",
      maxResultCount: 1,
    }),
  });

  if (!res.ok) return null;

  const json = await res.json() as {
    places?: Array<{
      id?: string;
      displayName?: { text?: string };
      formattedAddress?: string;
      nationalPhoneNumber?: string;
      websiteUri?: string;
      googleMapsUri?: string;
      location?: { latitude?: number; longitude?: number };
      photos?: Array<{ name: string }>;
    }>;
  };

  const p = json.places?.[0];
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
