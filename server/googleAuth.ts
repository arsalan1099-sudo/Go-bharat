import { OAuth2Client } from "google-auth-library";

// The OAuth Web Client ID. It is public (shipped to the browser as
// EXPO_PUBLIC_GOOGLE_CLIENT_ID) and also used here as the expected audience when
// verifying the ID token Google returns. GOOGLE_OAUTH_CLIENT_ID can override it.
const GOOGLE_CLIENT_ID =
  process.env.GOOGLE_OAUTH_CLIENT_ID ||
  process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID ||
  "";

// Additional OAuth client IDs accepted as valid ID-token audiences. The web
// build's Google Identity Services mints tokens whose `aud` is the Web client
// ID (GOOGLE_CLIENT_ID). Median's NATIVE Google Sign-In (used inside the Android
// app) is normally configured with the same Web client ID as its server client
// ID, so its tokens also carry the Web client ID as audience and verify with no
// extra config. This env var is an optional safety net: if a native build is
// configured to mint tokens with a platform-specific (Android/iOS) client ID as
// the audience, list those IDs here (comma-separated) so they verify too.
const EXTRA_CLIENT_IDS = (process.env.GOOGLE_OAUTH_EXTRA_CLIENT_IDS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const ACCEPTED_AUDIENCES = [GOOGLE_CLIENT_ID, ...EXTRA_CLIENT_IDS].filter(Boolean);

let client: OAuth2Client | null = null;
function getClient(): OAuth2Client {
  if (!client) client = new OAuth2Client(GOOGLE_CLIENT_ID);
  return client;
}

export function isGoogleConfigured(): boolean {
  return !!GOOGLE_CLIENT_ID;
}

export interface GoogleProfile {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string;
  picture?: string;
}

// Verifies a Google ID token (the "credential" returned by Google Identity
// Services on the web) and returns the trusted profile, or null if invalid.
export async function verifyGoogleIdToken(credential: string): Promise<GoogleProfile | null> {
  if (!GOOGLE_CLIENT_ID) return null;
  try {
    const ticket = await getClient().verifyIdToken({
      idToken: credential,
      audience: ACCEPTED_AUDIENCES.length === 1 ? ACCEPTED_AUDIENCES[0] : ACCEPTED_AUDIENCES,
    });
    const payload = ticket.getPayload();
    if (!payload || !payload.sub || !payload.email) return null;
    return {
      sub: payload.sub,
      email: payload.email,
      emailVerified: !!payload.email_verified,
      name: payload.name || "",
      picture: payload.picture,
    };
  } catch (err) {
    console.error("Google ID token verification failed:", (err as Error).message);
    return null;
  }
}
