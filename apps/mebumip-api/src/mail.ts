import { config } from "./config.js";

type MailMessage = { to: string; subject: string; text: string; html: string };
export type MailDelivery = { delivered: boolean; provider: "resend" | "test_sink" | "unconfigured" };
const testOutbox: MailMessage[] = [];

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

/** Test-only mail sink. It is never used outside NODE_ENV=test. */
export function getTestMailOutbox(): MailMessage[] { return [...testOutbox]; }
export function clearTestMailOutbox(): void { testOutbox.length = 0; }

async function deliver(message: MailMessage): Promise<MailDelivery> {
  if (config.NODE_ENV === "test") {
    testOutbox.push(message);
    return { delivered: true, provider: "test_sink" };
  }
  if (!config.RESEND_API_KEY || !config.MAIL_FROM) return { delivered: false, provider: "unconfigured" };
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: "Bearer " + config.RESEND_API_KEY, "content-type": "application/json" },
      body: JSON.stringify({ from: config.MAIL_FROM, to: [message.to], subject: message.subject, text: message.text, html: message.html }),
      signal: AbortSignal.timeout(10_000),
    });
    return { delivered: response.ok, provider: "resend" };
  } catch {
    return { delivered: false, provider: "resend" };
  }
}

export function sendTenantInvitationEmail(input: { to: string; tenantName: string; role: string; token: string; expiresAt: Date }): Promise<MailDelivery> {
  const text = "You have been invited to join " + input.tenantName + " as " + input.role + ".\n\nInvitation token: " + input.token + "\n\nThis token expires at " + input.expiresAt.toISOString() + " and can be used once.";
  const html = "<p>You have been invited to join <strong>" + escapeHtml(input.tenantName) + "</strong> as " + escapeHtml(input.role) + ".</p><p>Use this one-time invitation token during registration or invitation acceptance:</p><p><code>" + escapeHtml(input.token) + "</code></p><p>Expires: " + escapeHtml(input.expiresAt.toISOString()) + "</p>";
  return deliver({ to: input.to, subject: "Invitation to " + input.tenantName, text, html });
}

export function sendPasswordRecoveryEmail(input: { to: string; token: string; expiresAt: Date }): Promise<MailDelivery> {
  const text = "A password reset was requested for your Zuri MeBuMIP account.\n\nPassword reset token: " + input.token + "\n\nThis token expires at " + input.expiresAt.toISOString() + " and can be used once. If you did not request this, ignore this email.";
  const html = "<p>A password reset was requested for your Zuri MeBuMIP account.</p><p>Use this one-time password reset token:</p><p><code>" + escapeHtml(input.token) + "</code></p><p>Expires: " + escapeHtml(input.expiresAt.toISOString()) + "</p><p>If you did not request this, ignore this email.</p>";
  return deliver({ to: input.to, subject: "Zuri MeBuMIP password recovery", text, html });
}
