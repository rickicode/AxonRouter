import { VOICE_FETCHERS } from "../../../../../../open-sse/handlers/ttsCore";
import { NextResponse } from "next/server";

type LocalDeviceVoice = {
  id: string;
  name: string;
  locale: string;
  lang: string;
  country: string;
  gender: string;
};

type ElevenLabsVoice = {
  voice_id: string;
  name: string;
  category?: string;
  labels?: {
    language?: string;
    gender?: string;
  };
};

type EdgeTtsVoice = {
  Locale: string;
  ShortName: string;
  FriendlyName?: string;
  Gender: string;
};

type VoiceResponseItem = {
  id: string;
  name: string;
  locale: string;
  lang: string;
  country: string;
  countryName: string;
  langName: string;
  gender: string;
  category?: string;
};

type VoiceLanguageGroup = {
  code: string;
  name: string;
  voices: VoiceResponseItem[];
};

type VoiceFetcherMap = Record<string, (...args: unknown[]) => Promise<unknown[]>>;

// Map locale code -> country name
const LOCALE_NAMES = new Intl.DisplayNames(["en"], { type: "region" });
const LANG_NAMES = new Intl.DisplayNames(["en"], { type: "language" });

function countryName(code: string): string {
  try {
    return LOCALE_NAMES.of(code) ?? code;
  } catch {
    return code;
  }
}

function langName(code: string): string {
  try {
    return LANG_NAMES.of(code) ?? code;
  } catch {
    return code;
  }
}

/**
 * GET /api/media-providers/tts/voices
 * Query:
 *   ?provider=edge-tts | local-device | elevenlabs  (default: edge-tts)
 *   ?lang=en     (optional filter by lang code)
 *   ?apiKey=xxx  (required for elevenlabs)
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const provider = searchParams.get("provider") || "edge-tts";
    const langFilter = searchParams.get("lang");
    const apiKey = searchParams.get("apiKey");

    const fetcher = (VOICE_FETCHERS as VoiceFetcherMap)[provider];
    if (!fetcher) {
      return NextResponse.json(
        { error: `Provider '${provider}' does not support voice listing` },
        { status: 400 }
      );
    }

    // ElevenLabs requires API key
    const raw = provider === "elevenlabs" ? await fetcher(apiKey) : await fetcher();
    let voices: VoiceResponseItem[];

    if (provider === "local-device") {
      voices = (raw as LocalDeviceVoice[]).map((v) => ({
        id: v.id,
        name: v.name,
        locale: v.locale.replace("_", "-"),
        lang: v.lang,
        country: v.country,
        countryName: countryName(v.country),
        langName: langName(v.lang),
        gender: v.gender,
      }));
    } else if (provider === "elevenlabs") {
      voices = (raw as ElevenLabsVoice[]).map((v) => ({
        id: v.voice_id,
        name: v.name,
        locale: v.labels?.language || "en",
        lang: (v.labels?.language || "en").split("-")[0],
        country: "",
        countryName: "",
        langName: langName((v.labels?.language || "en").split("-")[0]),
        gender: v.labels?.gender || "",
        category: v.category,
      }));
    } else {
      // edge-tts (default)
      voices = (raw as EdgeTtsVoice[]).map((v) => {
        const [lang, country] = v.Locale.split("-");
        return {
          id: v.ShortName,
          name: (v.FriendlyName || v.ShortName)
            .replace("Microsoft ", "")
            .replace(/ Online \(Natural\) - /g, " ("),
          locale: v.Locale,
          lang,
          country: country || "",
          countryName: countryName(country || lang),
          langName: langName(lang),
          gender: v.Gender,
        };
      });
    }

    if (langFilter) {
      voices = voices.filter((v) => v.lang === langFilter);
    }

    const byLang: Record<string, VoiceLanguageGroup> = {};
    for (const v of voices) {
      const key = v.lang;
      if (!byLang[key]) {
        byLang[key] = { code: key, name: v.langName, voices: [] };
      }
      byLang[key].voices.push(v);
    }

    const languages = Object.values(byLang).sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({ voices, languages, byLang });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch voices";
    return NextResponse.json({ error: message || "Failed to fetch voices" }, { status: 502 });
  }
}
