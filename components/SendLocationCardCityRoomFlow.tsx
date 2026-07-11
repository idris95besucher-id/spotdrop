"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import CityRoomChatComposer from "@/components/CityRoomChatComposer";
import CountryCitiesPanel from "@/components/rooms/CountryCitiesPanel";
import LocationCardShareCard from "@/components/LocationCardShareCard";
import VisitExplorePanel from "@/components/visit/VisitExplorePanel";
import { useI18n } from "@/components/I18nProvider";
import { localizeCountryName, localizeCityName } from "@/lib/i18n/localizeGeo";
import { localizeUserMessage } from "@/lib/i18n/localizeUserMessage";
import type { LocationCardSharePayload } from "@/lib/locationCardShareMessage";
import type { RoomCity, RoomCountry } from "@/lib/roomExplore";
import { renderSpotLocationCardFile } from "@/lib/renderSpotLocationCard";
import { sendLocationCardToCityRoom } from "@/lib/sendLocationCardShare";
import type { SpotLocationCardFontStyle } from "@/lib/spotLocationCardStyles";
import type { SpotGeoLocation } from "@/lib/spotLocation";
import { bottomSheetLayout } from "@/lib/bottomSheetScrollLock";

type SendLocationCardCityRoomFlowProps = {
  userId: string | null;
  cardText: string;
  cardFontStyle: SpotLocationCardFontStyle;
  locationLabel: string;
  location: SpotGeoLocation;
  onBack: () => void;
  onSent: () => void;
};

type FlowStep = "countries" | "cities" | "compose";

export default function SendLocationCardCityRoomFlow({
  userId,
  cardText,
  cardFontStyle,
  locationLabel,
  location,
  onBack,
  onSent,
}: SendLocationCardCityRoomFlowProps) {
  const { t, locale } = useI18n();
  const [step, setStep] = useState<FlowStep>("countries");
  const [selectedCountry, setSelectedCountry] = useState<RoomCountry | null>(null);
  const [selectedCity, setSelectedCity] = useState<RoomCity | null>(null);
  const [previewCard, setPreviewCard] = useState<LocationCardSharePayload | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (step !== "compose" || previewCard) {
      return;
    }

    let cancelled = false;
    let objectUrl: string | null = null;

    setPreviewLoading(true);

    void renderSpotLocationCardFile({
      cardText,
      fontStyle: cardFontStyle,
      locationLabel,
    })
      .then((file) => {
        if (cancelled) {
          return;
        }

        objectUrl = URL.createObjectURL(file);
        setPreviewCard({
          imageUrl: objectUrl,
          cardText: cardText.trim(),
          locationLabel,
          latitude: location.latitude,
          longitude: location.longitude,
          fontStyle: cardFontStyle,
        });
      })
      .catch((caught) => {
        if (cancelled) {
          return;
        }

        const messageText = caught instanceof Error ? caught.message : t("spotLocationCard.sendFailed");
        setError(messageText);
      })
      .finally(() => {
        if (!cancelled) {
          setPreviewLoading(false);
        }
      });

    return () => {
      cancelled = true;

      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [cardFontStyle, cardText, location.latitude, location.longitude, locationLabel, previewCard, step, t]);

  useEffect(() => {
    if (step !== "compose") {
      return;
    }

    const timer = window.setTimeout(() => {
      composerRef.current?.focus();
    }, 120);

    return () => {
      window.clearTimeout(timer);
    };
  }, [step]);

  const localizedCityName = useMemo(() => {
    if (!selectedCity || !selectedCountry) {
      return null;
    }

    return localizeCityName(locale, {
      slug: selectedCity.slug,
      name: selectedCity.name,
      countrySlug: selectedCountry.slug,
    });
  }, [locale, selectedCity, selectedCountry]);

  const headerTitle = useMemo(() => {
    if (step === "countries") {
      return t("visit.exploreRoomsTitle");
    }

    if (step === "cities" && selectedCountry) {
      return localizeCountryName(locale, {
        slug: selectedCountry.slug,
        name: selectedCountry.name,
      });
    }

    return localizedCityName ?? t("rooms.cityRoom");
  }, [locale, localizedCityName, selectedCountry, step, t]);

  const handleBack = () => {
    setError(null);

    if (step === "compose") {
      setStep("cities");
      setSelectedCity(null);
      setMessage("");
      setPreviewCard(null);
      return;
    }

    if (step === "cities") {
      setStep("countries");
      setSelectedCountry(null);
      return;
    }

    onBack();
  };

  const handleSelectCountry = (country: RoomCountry) => {
    setSelectedCountry(country);
    setSelectedCity(null);
    setStep("cities");
    setError(null);
  };

  const handleSelectCity = (_city: RoomCity, country: RoomCountry) => {
    setSelectedCountry(country);
    setSelectedCity(_city);
    setStep("compose");
    setError(null);
  };

  const handleSend = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!userId || !selectedCountry || !selectedCity || sending) {
      return;
    }

    setSending(true);
    setError(null);

    try {
      const result = await sendLocationCardToCityRoom({
        userId,
        countrySlug: selectedCountry.slug,
        citySlug: selectedCity.slug,
        cardText,
        fontStyle: cardFontStyle,
        locationLabel,
        location,
        optionalMessage: message,
      });

      if (result.error) {
        setError(result.error);
        return;
      }

      onSent();
    } catch (caught) {
      const messageText = caught instanceof Error ? caught.message : t("spotLocationCard.sendFailed");
      setError(messageText);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-white/10 px-4 py-3">
        <button
          type="button"
          onClick={handleBack}
          className="rounded-full px-2 py-1 text-sm font-medium text-cyan-300 transition hover:bg-white/5"
        >
          {t("common.back")}
        </button>
        <h2 className="min-w-0 flex-1 truncate text-base font-semibold text-white">{headerTitle}</h2>
      </div>

      {step === "compose" ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div data-bottom-sheet-scroll className={`${bottomSheetLayout.scroll} flex-1 px-4 py-4`}>
            <p className="text-sm text-slate-300">{t("spotLocationCard.roomComposerHint")}</p>

            <div className="mt-4 max-w-sm">
              {previewLoading ? (
                <div className="flex aspect-[4/5] items-center justify-center rounded-2xl border border-white/10 bg-slate-900 text-sm text-muted">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                  {t("spotLocationCard.preparingCard")}
                </div>
              ) : previewCard ? (
                <LocationCardShareCard card={previewCard} compact />
              ) : null}
            </div>

            {error ? (
              <p className="mt-3 text-sm text-red-300">{localizeUserMessage(t, error) ?? error}</p>
            ) : null}
          </div>

          <CityRoomChatComposer
            value={message}
            onChange={setMessage}
            onSubmit={(event) => void handleSend(event)}
            sending={sending}
            sendDisabled={sending || !userId || previewLoading || !previewCard}
            sendError={error}
            inputDisabled={!userId || previewLoading}
            placeholder={t("spotLocationCard.roomComposerPlaceholder")}
            textareaRef={composerRef}
          />
        </div>
      ) : (
        <div data-bottom-sheet-scroll className={`${bottomSheetLayout.scroll} py-2`}>
          {step === "countries" ? (
            <VisitExplorePanel onSelectCountry={handleSelectCountry} showHeader={false} />
          ) : selectedCountry ? (
            <div className="px-4">
              <CountryCitiesPanel
                countrySlug={selectedCountry.slug}
                onSelectCity={handleSelectCity}
                showCountryHeader={false}
              />
            </div>
          ) : null}

          {error ? (
            <p className="px-4 text-sm text-red-300">{localizeUserMessage(t, error) ?? error}</p>
          ) : null}
        </div>
      )}
    </div>
  );
}
