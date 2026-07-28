import { Platform } from "react-native";

// Bundled looping ring tone. Metro bundles mp3 as an asset on both native & web.
const SOUND_MODULE = require("../assets/sounds/new-order.mp3");

let primed = false;
// Desired playback state. start/stop flip this synchronously so an in-flight
// startOrderAlarm() that is still awaiting audio creation can detect that a
// stop happened meanwhile and abort instead of playing after acknowledgement.
let wantPlaying = false;

// --- Web (HTMLAudioElement) ---
let webAudio: any = null;
let webUriPromise: Promise<string | null> | null = null;

// --- Native (expo-av) ---
let nativeSound: any = null;
let nativeLoading: Promise<any> | null = null;

function resolveWebUri(): Promise<string | null> {
  if (webUriPromise) return webUriPromise;
  webUriPromise = (async () => {
    try {
      const { Asset } = require("expo-asset");
      const asset = Asset.fromModule(SOUND_MODULE);
      if (!asset.downloaded && asset.downloadAsync) {
        try {
          await asset.downloadAsync();
        } catch {}
      }
      return asset.localUri || asset.uri || null;
    } catch {
      // Some web bundlers resolve require() of an asset straight to a URL/object.
      try {
        if (typeof SOUND_MODULE === "string") return SOUND_MODULE;
        if (SOUND_MODULE && typeof SOUND_MODULE.uri === "string") return SOUND_MODULE.uri;
      } catch {}
      return null;
    }
  })();
  return webUriPromise;
}

function createWebAudio(uri: string): any | null {
  const g: any = typeof window !== "undefined" ? window : undefined;
  if (!g || typeof g.Audio === "undefined") return null;
  try {
    const a = new g.Audio(uri);
    a.loop = true;
    a.volume = 1.0;
    a.preload = "auto";
    webAudio = a;
    return webAudio;
  } catch {
    return null;
  }
}

async function getWebAudio(): Promise<any | null> {
  if (webAudio) return webAudio;
  const uri = await resolveWebUri();
  if (!uri || webAudio) return webAudio;
  return createWebAudio(uri);
}

async function getNativeSound(): Promise<any | null> {
  if (nativeSound) return nativeSound;
  if (nativeLoading) return nativeLoading;
  nativeLoading = (async () => {
    try {
      const { Audio } = require("expo-av");
      try {
        await Audio.setAudioModeAsync({
          playsInSilentModeIOS: true,
          staysActiveInBackground: false,
          shouldDuckAndroid: true,
        });
      } catch {}
      const { sound } = await Audio.Sound.createAsync(SOUND_MODULE, {
        isLooping: true,
        volume: 1.0,
        shouldPlay: false,
      });
      nativeSound = sound;
      return nativeSound;
    } catch {
      return null;
    } finally {
      nativeLoading = null;
    }
  })();
  return nativeLoading;
}

/**
 * Eagerly prepare the audio object WITHOUT a user gesture so the element already
 * exists by the time the first gesture fires. Safe to call repeatedly.
 */
export function preloadOrderAlarm(): void {
  try {
    if (Platform.OS === "web") {
      if (webAudio) return;
      resolveWebUri()
        .then((uri) => {
          if (uri && !webAudio) createWebAudio(uri);
        })
        .catch(() => {});
    } else {
      getNativeSound().catch(() => {});
    }
  } catch {}
}

/**
 * Unlock audio playback. On web, browsers block programmatic playback until the
 * user has interacted with the page — so this MUST be invoked from inside a real
 * user-gesture handler. The actual play() call runs synchronously (before any
 * await) so it stays inside the browser's user-activation window. `primed` is
 * only set true after a successful unlock, so a failed attempt can be retried on
 * the next gesture.
 */
export async function primeOrderAlarm(): Promise<void> {
  if (primed) return;
  try {
    if (Platform.OS === "web") {
      const a = webAudio; // synchronous access to the preloaded element
      if (!a) {
        preloadOrderAlarm(); // not ready yet — prepare for the next gesture
        return;
      }
      a.muted = true;
      const p = a.play(); // synchronous: stays within the user-activation window
      if (p && typeof p.then === "function") {
        await p
          .then(() => {
            try {
              a.pause();
              a.currentTime = 0;
            } catch {}
            a.muted = false;
            primed = true;
          })
          .catch(() => {
            try {
              a.muted = false;
            } catch {}
          });
      } else {
        try {
          a.pause();
          a.currentTime = 0;
        } catch {}
        a.muted = false;
        primed = true;
      }
    } else {
      primed = true;
      await getNativeSound();
    }
  } catch {}
}

export function isOrderAlarmPrimed(): boolean {
  return primed;
}

export async function startOrderAlarm(): Promise<void> {
  wantPlaying = true;
  try {
    if (Platform.OS === "web") {
      const a = await getWebAudio();
      if (!a || !wantPlaying) return;
      try {
        a.loop = true;
        a.muted = false;
        a.currentTime = 0;
      } catch {}
      if (!wantPlaying) return;
      const p = a.play();
      if (p && typeof p.then === "function") await p.catch(() => {});
      // A stop may have landed while play() was resolving — honor it.
      if (!wantPlaying) {
        try {
          a.pause();
          a.currentTime = 0;
        } catch {}
      }
    } else {
      const s = await getNativeSound();
      if (!s || !wantPlaying) return;
      try {
        await s.setIsLoopingAsync(true);
        await s.setVolumeAsync(1.0);
        await s.setPositionAsync(0);
      } catch {}
      if (!wantPlaying) return;
      await s.playAsync();
      if (!wantPlaying) {
        try {
          await s.stopAsync();
        } catch {}
      }
    }
  } catch {}
}

export async function stopOrderAlarm(): Promise<void> {
  wantPlaying = false;
  try {
    if (Platform.OS === "web") {
      if (webAudio) {
        try {
          webAudio.pause();
          webAudio.currentTime = 0;
        } catch {}
      }
    } else {
      if (nativeSound) {
        try {
          await nativeSound.stopAsync();
        } catch {}
      }
    }
  } catch {}
}

export function isOrderAlarmPlaying(): boolean {
  return wantPlaying;
}
