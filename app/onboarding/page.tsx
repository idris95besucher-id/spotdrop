"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { getSafeAuthSession } from "@/lib/authSession";
import { ensureProfileRow } from "@/lib/profile";
import { uploadAvatarImage } from "@/lib/profileMedia";
import { pickSpotGalleryPhoto } from "@/lib/pickMediaFromGallery";
import { getCountryFlag } from "@/lib/countryFlags";
import { supabase } from "@/lib/supabaseClient";
import AvatarCropScreen from "@/components/AvatarCropScreen";
import ProfileAvatar from "@/components/ProfileAvatar";
import Shell from "@/components/Shell";
import { useI18n } from "@/components/I18nProvider";
import { localizeUserMessage } from "@/lib/i18n/localizeUserMessage";
import { localizeCountryName, localizeCityName } from "@/lib/i18n/localizeGeo";

type CountryOption = {
  id: string;
  name: string;
  slug: string;
  code: string;
  emoji?: string | null;
};

type CityOption = {
  id: string;
  name: string;
  slug: string;
  country_id: string;
};

export default function OnboardingPage() {
  const router = useRouter();
  const { t, locale } = useI18n();
  const [username, setUsername] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [bio, setBio] = useState("");
  const [selectedCountryId, setSelectedCountryId] = useState("");
  const [cityId, setCityId] = useState("");
  const [countryOptions, setCountryOptions] = useState<CountryOption[]>([]);
  const [cityOptions, setCityOptions] = useState<CityOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [pickingAvatar, setPickingAvatar] = useState(false);
  const [avatarCropFile, setAvatarCropFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    const checkSession = async () => {
      const { session, error: sessionError } = await getSafeAuthSession();

      setSession(session);
      if (sessionError) {
        setError(sessionError);
      }

      const [{ data: countriesData, error: countriesError }, { data: citiesData, error: citiesError }] = await Promise.all([
        supabase.from("countries").select("id, name, slug, code, emoji").order("name", { ascending: true }),
        supabase.from("cities").select("id, name, slug, country_id").order("name", { ascending: true }),
      ]);

      if (countriesError) {
        setError(countriesError.message);
      }
      if (citiesError) {
        setError(citiesError.message);
      }

      setCountryOptions(countriesData ?? []);
      setCityOptions(citiesData ?? []);

      if (!session?.user?.id) {
        setLoading(false);
        return;
      }

      const ensuredProfile = await ensureProfileRow({ user: session.user });

      if (ensuredProfile.error && !ensuredProfile.needsOnboarding) {
        setError(ensuredProfile.error);
      }

      const data = ensuredProfile.profile;

      if (data) {
        setUsername(data.username ?? "");
        setAvatarUrl(data.avatar_url ?? "");
        setBio(data.bio ?? "");
        setCityId(data.city_id ?? "");

        const matchingCountry = (countriesData ?? []).find((country) => country.slug === data.country_slug);
        setSelectedCountryId(matchingCountry?.id ?? "");
      }

      setLoading(false);
    };

    void checkSession();
  }, [router]);

  const persistAvatarUrl = async (publicUrl: string) => {
    if (!session?.user) {
      throw new Error("Please sign in first.");
    }

    const ensuredProfile = await ensureProfileRow({ user: session.user });

    if (ensuredProfile.error && !ensuredProfile.needsOnboarding) {
      throw new Error(ensuredProfile.error);
    }

    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        avatar_url: publicUrl,
        updated_at: new Date().toISOString(),
      })
      .eq("id", session.user.id);

    if (updateError) {
      console.error("Failed to persist avatar_url:", updateError);
      throw new Error(updateError.message || "Unable to save your profile photo.");
    }
  };

  const handlePickAvatar = async () => {
    if (!session?.user?.id || uploadingAvatar || pickingAvatar) {
      return;
    }

    setError(null);
    setPickingAvatar(true);

    try {
      const file = await pickSpotGalleryPhoto();
      if (file) {
        setAvatarCropFile(file);
      }
    } catch (pickError) {
      setError(pickError instanceof Error ? pickError.message : "Unable to open photos.");
    } finally {
      setPickingAvatar(false);
    }
  };

  const handleAvatarCropConfirm = async (croppedFile: File) => {
    if (!session?.user?.id) {
      setError("Please sign in to upload files.");
      setAvatarCropFile(null);
      return;
    }

    setError(null);
    setUploadingAvatar(true);

    try {
      const publicUrl = await uploadAvatarImage(session.user.id, croppedFile);
      setAvatarUrl(publicUrl);
      await persistAvatarUrl(publicUrl);
      setAvatarCropFile(null);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Unable to upload profile photo.");
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!username.trim()) {
      setError("Choose a unique username.");
      return;
    }

    if (!session?.user?.id) {
      setError("Please sign in first.");
      return;
    }

    setSaving(true);

    const { data: existingUser } = await supabase
      .from("profiles")
      .select("id")
      .eq("username", username.trim())
      .neq("id", session.user.id)
      .maybeSingle();

    if (existingUser) {
      setError("That username is already taken.");
      setSaving(false);
      return;
    }

    const selectedCountry = countryOptions.find((country) => country.id === selectedCountryId);

    const { error: upsertError } = await supabase.from("profiles").upsert({
      id: session.user.id,
      username: username.trim(),
      avatar_url: avatarUrl || null,
      bio: bio || null,
      country_slug: selectedCountry?.slug ?? null,
      city_id: cityId || null,
      updated_at: new Date().toISOString(),
    });

    if (upsertError) {
      setError(upsertError.message);
      setSaving(false);
      return;
    }

    router.push("/profile");
  };

  const selectedCities = cityOptions.filter((city) => city.country_id === selectedCountryId);
  const localizedError = localizeUserMessage(t, error);

  return (
    <Shell>
      <div className="mx-auto max-w-3xl rounded-3xl border border-white/10 bg-slate-900/90 p-8 shadow-xl shadow-black/40">
        <div className="space-y-4">
          <p className="text-sm uppercase tracking-[0.35em] text-cyan-300">{t("onboarding.label")}</p>
          <h1 className="text-4xl font-semibold text-white">{t("onboarding.title")}</h1>
        </div>

        {loading ? (
          <div className="rounded-3xl border border-dashed border-slate-700 bg-slate-950 p-8 text-center text-slate-400">
            {t("onboarding.loading")}
          </div>
        ) : !session?.user?.id ? (
          <div className="rounded-3xl border border-dashed border-white/10 bg-white/5 p-8 text-center text-slate-300">
            <p className="text-lg font-semibold text-white">{t("onboarding.mustSignIn")}</p>
            <p className="mt-3 text-slate-400">{t("onboarding.signInPrompt")}</p>
            <a href="/auth/login" className="mt-6 inline-flex rounded-3xl bg-cyan-500 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400">
              {t("onboarding.login")}
            </a>
          </div>
        ) : (
          <form className="space-y-6" onSubmit={handleSubmit}>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm text-slate-300">
                {t("common.username")} <span className="text-cyan-200">*</span>
                <input
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  className="mt-2 w-full rounded-3xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-cyan-400"
                />
              </label>
              <div className="text-sm text-slate-300">
                <span className="block">{t("onboarding.profilePhoto")}</span>
                <div className="mt-2 flex items-center gap-4 rounded-3xl border border-white/10 bg-slate-950 p-4">
                  <ProfileAvatar
                    src={avatarUrl}
                    alt="Profile avatar preview"
                    sizeClassName="h-16 w-16"
                    iconClassName="h-7 w-7"
                    className="bg-slate-800"
                  />
                  <button
                    type="button"
                    onClick={() => void handlePickAvatar()}
                    disabled={uploadingAvatar || pickingAvatar}
                    className="inline-flex cursor-pointer items-center justify-center rounded-3xl bg-white/5 px-4 py-3 text-sm font-medium text-white transition hover:bg-white/10 disabled:opacity-50"
                  >
                    {uploadingAvatar
                      ? t("onboarding.uploading")
                      : pickingAvatar
                        ? t("avatarCrop.picking")
                        : t("onboarding.uploadPhoto")}
                  </button>
                </div>
              </div>
            </div>


            <label className="block text-sm text-slate-300">
              {t("onboarding.bio")}
              <textarea
                value={bio}
                onChange={(event) => setBio(event.target.value)}
                rows={4}
                className="mt-2 w-full rounded-3xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-cyan-400"
              />
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm text-slate-300">
                {t("onboarding.country")}
                <select
                  value={selectedCountryId}
                  onChange={(event) => {
                    setSelectedCountryId(event.target.value);
                    setCityId("");
                  }}
                  className="mt-2 w-full rounded-3xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-cyan-400"
                >
                  <option value="">{t("onboarding.optionalCountry")}</option>
                  {countryOptions.map((country) => (
                    <option key={country.id} value={country.id}>
                      {getCountryFlag(country.slug, country.emoji, country.code)}{" "}
                      {localizeCountryName(locale, { slug: country.slug, name: country.name, countryCode: country.code })}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm text-slate-300">
                {t("search.city")}
                <select
                  value={cityId}
                  onChange={(event) => setCityId(event.target.value)}
                  disabled={!selectedCountryId}
                  className="mt-2 w-full rounded-3xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <option value="">{t("onboarding.optionalCity")}</option>
                  {selectedCities.map((city) => (
                    <option key={city.id} value={city.id}>
                      {localizeCityName(locale, {
                        slug: city.slug,
                        name: city.name,
                        countrySlug: countryOptions.find((c) => c.id === selectedCountryId)?.slug ?? null,
                      })}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {localizedError ? <p className="text-sm text-red-300">{localizedError}</p> : null}

            <button
              type="submit"
              disabled={saving}
              className="inline-flex w-full items-center justify-center rounded-3xl bg-cyan-500 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? t("onboarding.saving") : t("onboarding.complete")}
            </button>
          </form>
        )}
      </div>

      {avatarCropFile ? (
        <AvatarCropScreen
          file={avatarCropFile}
          busy={uploadingAvatar}
          onCancel={() => {
            if (!uploadingAvatar) {
              setAvatarCropFile(null);
            }
          }}
          onConfirm={(cropped) => {
            void handleAvatarCropConfirm(cropped);
          }}
        />
      ) : null}
    </Shell>
  );
}
