/**
 * Static params for Capacitor `output: "export"`.
 *
 * During a regular Vercel / dev build every function returns the `_` placeholder —
 * the Next.js router handles real paths client-side via useParams().
 *
 * During a Capacitor build (CAPACITOR_BUILD=1) the functions fetch real slugs from
 * Supabase so that Next.js generates an actual HTML + RSC payload file for every
 * country, city, and channel.  Without these real files the App Router falls back to
 * a hard navigation, Capacitor serves the root index.html, and the user sees the
 * welcome screen instead of the correct page.
 */

import { createClient } from "@supabase/supabase-js";

/** Sentinel value used when we cannot (or do not need to) generate real paths. */
const PLACEHOLDER = "_";

function buildStaticSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

  if (!url || !key || url.includes("your-project-ref")) {
    return null;
  }

  return createClient(url, key);
}

// ---------------------------------------------------------------------------
// Room routes — fetched from Supabase at Capacitor build time
// ---------------------------------------------------------------------------

export async function countryStaticParams(): Promise<{ country: string }[]> {
  const ensureSwitzerland = (params: { country: string }[]) => {
    if (params.some((p) => p.country === "switzerland")) {
      return params;
    }

    return [...params, { country: "switzerland" }];
  };

  if (process.env.CAPACITOR_BUILD !== "1") {
    return ensureSwitzerland([{ country: PLACEHOLDER }]);
  }

  try {
    const supabase = buildStaticSupabaseClient();

    if (!supabase) {
      console.warn("[staticParams] Supabase client unavailable, using switzerland fallback for countries");
      return ensureSwitzerland([{ country: PLACEHOLDER }]);
    }

    const { data, error } = await supabase
      .from("countries")
      .select("slug")
      .order("slug", { ascending: true });

    if (error) {
      console.warn("[staticParams] Failed to fetch countries:", error.message);
      return ensureSwitzerland([{ country: PLACEHOLDER }]);
    }

    const params = (data ?? [])
      .map((c) => ({ country: c.slug as string }))
      .filter((p) => Boolean(p.country));

    console.log(`[staticParams] Generated ${params.length} country params`);
    return ensureSwitzerland(params.length > 0 ? params : [{ country: PLACEHOLDER }]);
  } catch (err) {
    console.warn("[staticParams] countryStaticParams error:", err);
    return ensureSwitzerland([{ country: PLACEHOLDER }]);
  }
}

export async function cityStaticParams(): Promise<{ country: string; city: string }[]> {
  if (process.env.CAPACITOR_BUILD !== "1") {
    return [{ country: PLACEHOLDER, city: PLACEHOLDER }];
  }

  try {
    const supabase = buildStaticSupabaseClient();

    if (!supabase) {
      console.warn("[staticParams] Supabase client unavailable, using _ placeholder for cities");
      return [{ country: PLACEHOLDER, city: PLACEHOLDER }];
    }

    // Join cities → countries to get both slugs in one query
    const { data, error } = await supabase
      .from("cities")
      .select("slug, countries!inner(slug)")
      .order("slug", { ascending: true });

    if (error) {
      console.warn("[staticParams] Failed to fetch cities:", error.message);
      return [{ country: PLACEHOLDER, city: PLACEHOLDER }];
    }

    const params = (data ?? [])
      .map((c) => {
        const countryRow = c.countries as unknown as { slug: string } | null;
        return {
          country: countryRow?.slug ?? "",
          city: c.slug as string,
        };
      })
      .filter((p) => Boolean(p.country) && Boolean(p.city));

    console.log(`[staticParams] Generated ${params.length} city params`);
    return params.length > 0 ? params : [{ country: PLACEHOLDER, city: PLACEHOLDER }];
  } catch (err) {
    console.warn("[staticParams] cityStaticParams error:", err);
    return [{ country: PLACEHOLDER, city: PLACEHOLDER }];
  }
}

export async function channelStaticParams(): Promise<{
  country: string;
  city: string;
  channelSlug: string;
}[]> {
  if (process.env.CAPACITOR_BUILD !== "1") {
    return [{ country: PLACEHOLDER, city: PLACEHOLDER, channelSlug: PLACEHOLDER }];
  }

  try {
    const supabase = buildStaticSupabaseClient();

    if (!supabase) {
      console.warn("[staticParams] Supabase client unavailable, using _ placeholder for channels");
      return [{ country: PLACEHOLDER, city: PLACEHOLDER, channelSlug: PLACEHOLDER }];
    }

    const { data, error } = await supabase
      .from("channels")
      .select("slug, cities!inner(slug, countries!inner(slug))")
      .order("slug", { ascending: true });

    if (error) {
      console.warn("[staticParams] Failed to fetch channels:", error.message);
      return [{ country: PLACEHOLDER, city: PLACEHOLDER, channelSlug: PLACEHOLDER }];
    }

    const params = (data ?? [])
      .map((ch) => {
        const city = ch.cities as unknown as { slug: string; countries: { slug: string } | null } | null;
        return {
          country: city?.countries?.slug ?? "",
          city: city?.slug ?? "",
          channelSlug: ch.slug as string,
        };
      })
      .filter((p) => Boolean(p.country) && Boolean(p.city) && Boolean(p.channelSlug));

    console.log(`[staticParams] Generated ${params.length} channel params`);
    return params.length > 0
      ? params
      : [{ country: PLACEHOLDER, city: PLACEHOLDER, channelSlug: PLACEHOLDER }];
  } catch (err) {
    console.warn("[staticParams] channelStaticParams error:", err);
    return [{ country: PLACEHOLDER, city: PLACEHOLDER, channelSlug: PLACEHOLDER }];
  }
}

// ---------------------------------------------------------------------------
// Other dynamic routes — placeholders only (rendered client-side)
// ---------------------------------------------------------------------------

export const collectionStaticParams = () => [{ collectionId: PLACEHOLDER }];
export const postStaticParams = () => [{ postId: PLACEHOLDER }];
export const dmUserStaticParams = () => [{ userId: PLACEHOLDER }];
export const profileUserStaticParams = () => [{ userId: PLACEHOLDER }];
export const publicUserStaticParams = () => [{ userId: PLACEHOLDER }];
export const usernameStaticParams = () => [{ username: PLACEHOLDER }];
