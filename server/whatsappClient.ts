// WhatsApp Business (Meta Cloud API) message client.
//
// Credentials are resolved at request time from either:
//   1. Environment variables (WHATSAPP_ACCESS_TOKEN + WHATSAPP_PHONE_NUMBER_ID), or
//   2. The Replit WhatsApp Business connector (via the connectors proxy).
//
// All messages are delivered using approved Meta message templates. Each
// template (OTP, order/booking confirmation, …) has its own configurable name +
// language so the same code keeps working once Meta approves a template and the
// matching env var is set. Until then, sends degrade gracefully (configured:false).

const GRAPH_API_VERSION = process.env.WHATSAPP_GRAPH_API_VERSION || "v21.0";

// --- OTP (authentication category) template --------------------------------
// Meta requires an approved authentication template; override via env once approved.
const TEMPLATE_NAME = process.env.WHATSAPP_OTP_TEMPLATE_NAME || "";
const TEMPLATE_LANG = process.env.WHATSAPP_OTP_TEMPLATE_LANG || "en_US";

// Whether the OTP template includes a "copy code" URL button. Authentication
// templates created through Meta's wizard include this button by default, which
// requires the code to be passed as a button parameter as well as the body.
const TEMPLATE_HAS_COPY_BUTTON = process.env.WHATSAPP_OTP_TEMPLATE_NO_BUTTON !== "1";

// --- Order / booking confirmation (utility category) template --------------
// The approved template's body placeholders are expected, in order, to be:
//   {{1}} customer name, {{2}} order/booking id, {{3}} amount, {{4}} store name
const ORDER_TEMPLATE_NAME = process.env.WHATSAPP_ORDER_TEMPLATE_NAME || "";
const ORDER_TEMPLATE_LANG = process.env.WHATSAPP_ORDER_TEMPLATE_LANG || "en_US";

type WhatsAppCredentials = { accessToken: string; phoneNumberId: string };
export type WhatsAppSendResult = { sent: boolean; configured: boolean; error?: string };

async function resolveCredentials(): Promise<WhatsAppCredentials | null> {
  // 1. Explicit environment variables take precedence.
  const envToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const envPhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (envToken && envPhoneId) {
    return { accessToken: envToken, phoneNumberId: envPhoneId };
  }

  // 2. Replit WhatsApp Business connector via the connectors proxy.
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? "repl " + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
    ? "depl " + process.env.WEB_REPL_RENEWAL
    : null;

  if (!hostname || !xReplitToken) return null;

  try {
    const response = await fetch(
      `https://${hostname}/api/v2/connection?include_secrets=true&connector_names=whatsapp-business`,
      { headers: { Accept: "application/json", X_REPLIT_TOKEN: xReplitToken } }
    );
    if (!response.ok) return null;

    const data: any = await response.json();
    const item = data.items?.[0];
    const settings = item?.settings || {};

    const accessToken =
      settings.access_token ||
      settings.accessToken ||
      settings.api_key ||
      settings.apiKey ||
      settings.oauth?.credentials?.access_token ||
      settings.oauth?.credentials?.accessToken;

    const phoneNumberId =
      settings.phone_number_id ||
      settings.phoneNumberId ||
      settings.phone_id ||
      settings.from_phone_number_id ||
      process.env.WHATSAPP_PHONE_NUMBER_ID;

    if (!accessToken || !phoneNumberId) return null;
    return { accessToken, phoneNumberId };
  } catch (err: any) {
    console.error("WhatsApp credential lookup error:", err?.message || err);
    return null;
  }
}

// Whether WhatsApp OTP delivery can even be attempted. Requires an approved
// template name to be configured (without it Meta rejects the send).
export async function isWhatsAppConfigured(): Promise<boolean> {
  if (!TEMPLATE_NAME) return false;
  const creds = await resolveCredentials();
  return !!creds;
}

// Whether WhatsApp order/booking confirmation delivery can be attempted.
export async function isWhatsAppOrderConfigured(): Promise<boolean> {
  if (!ORDER_TEMPLATE_NAME) return false;
  const creds = await resolveCredentials();
  return !!creds;
}

// Normalize an Indian phone number to Meta's expected format (country code +
// number, digits only). Falls back to assuming a +91 (India) number when only
// 10 digits are supplied. Returns null when the number isn't usable.
function normalizePhone(toPhone: string): string | null {
  const digits = (toPhone || "").replace(/\D/g, "");
  if (digits.length === 10) return "91" + digits;
  if (digits.length === 12 && digits.startsWith("91")) return digits;
  if (digits.length === 11 && digits.startsWith("0")) return "91" + digits.slice(1);
  if (digits.length > 12) return digits.slice(-12);
  if (digits.length >= 10) return digits;
  return null;
}

// Meta rejects template parameters that contain newlines, tabs, or 4+ consecutive
// spaces. Collapse whitespace so dynamic values can never break a send.
function sanitizeParam(value: string): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

// Generic Meta template sender. `bodyParams` fill the template's {{1}}..{{n}}
// body placeholders in order; `buttonUrlParam` fills a copy-code style URL
// button (index 0). All higher-level senders (OTP, order confirmation) build on
// this so template wiring lives in exactly one place.
export async function sendWhatsAppTemplate(
  toPhone: string,
  templateName: string,
  languageCode: string,
  opts: { bodyParams?: string[]; buttonUrlParam?: string } = {}
): Promise<WhatsAppSendResult> {
  if (!templateName) {
    return { sent: false, configured: false, error: "WhatsApp template not configured" };
  }

  const creds = await resolveCredentials();
  if (!creds) {
    return { sent: false, configured: false, error: "WhatsApp Business not connected" };
  }

  const to = normalizePhone(toPhone);
  if (!to) {
    return { sent: false, configured: true, error: "Invalid phone number" };
  }

  const components: any[] = [];
  if (opts.bodyParams && opts.bodyParams.length) {
    components.push({
      type: "body",
      parameters: opts.bodyParams.map((text) => ({ type: "text", text })),
    });
  }
  if (opts.buttonUrlParam) {
    components.push({
      type: "button",
      sub_type: "url",
      index: "0",
      parameters: [{ type: "text", text: opts.buttonUrlParam }],
    });
  }

  try {
    const response = await fetch(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${creds.phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${creds.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "template",
          template: {
            name: templateName,
            language: { code: languageCode },
            components,
          },
        }),
      }
    );

    const data: any = await response.json().catch(() => ({}));

    if (response.ok && data?.messages?.length) {
      console.log(`WhatsApp template "${templateName}" sent to ${to} (message_id: ${data.messages[0]?.id})`);
      return { sent: true, configured: true };
    }

    const errMsg = data?.error?.message || `WhatsApp delivery failed (HTTP ${response.status})`;
    console.error(`WhatsApp error (${templateName}):`, errMsg);
    return { sent: false, configured: true, error: errMsg };
  } catch (err: any) {
    console.error(`WhatsApp error (${templateName}):`, err?.message || err);
    return { sent: false, configured: true, error: err?.message || "Failed to send WhatsApp message" };
  }
}

export async function sendWhatsAppOtp(
  toPhone: string,
  code: string
): Promise<WhatsAppSendResult> {
  if (!TEMPLATE_NAME) {
    return { sent: false, configured: false, error: "WhatsApp OTP template not configured" };
  }
  // Authentication templates with a copy-code button need the code echoed as a
  // button parameter too.
  return sendWhatsAppTemplate(toPhone, TEMPLATE_NAME, TEMPLATE_LANG, {
    bodyParams: [code],
    buttonUrlParam: TEMPLATE_HAS_COPY_BUTTON ? code : undefined,
  });
}

export type OrderConfirmationParams = {
  customerName?: string;
  orderId: string;
  amount: string;
  vendorName: string;
};

// Send an order/booking confirmation over WhatsApp using the approved utility
// template. Inert (configured:false) until WHATSAPP_ORDER_TEMPLATE_NAME is set
// and the WhatsApp Business connector is connected.
export async function sendWhatsAppOrderConfirmation(
  toPhone: string,
  params: OrderConfirmationParams
): Promise<WhatsAppSendResult> {
  if (!ORDER_TEMPLATE_NAME) {
    return { sent: false, configured: false, error: "WhatsApp order template not configured" };
  }
  const bodyParams = [
    sanitizeParam(params.customerName || "Customer"),
    sanitizeParam(params.orderId),
    sanitizeParam(params.amount),
    sanitizeParam(params.vendorName),
  ];
  return sendWhatsAppTemplate(toPhone, ORDER_TEMPLATE_NAME, ORDER_TEMPLATE_LANG, { bodyParams });
}
