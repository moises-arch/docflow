// Envío de alertas administrativas. Si Mailgun está configurado, manda email;
// si no, hace console.error con prefijo "ALERT:" para que Vercel logs lo capture.
//
// Variables de entorno opcionales:
//   MAILGUN_API_KEY      — Mailgun API key
//   MAILGUN_DOMAIN       — Mailgun sending domain (ej: mg.example.com)
//   MAILGUN_FROM         — From address (default: alerts@<domain>)
//   ADMIN_ALERT_EMAIL    — Destinatario (default: admin@example.com)

const DEFAULT_RECIPIENT = "admin@example.com";

export type AdminAlertResult = {
  delivered: boolean;
  via: "mailgun" | "console";
  error?: string;
};

export async function sendAdminAlert(
  subject: string,
  body: string,
): Promise<AdminAlertResult> {
  const apiKey = process.env.MAILGUN_API_KEY;
  const domain = process.env.MAILGUN_DOMAIN;
  const recipient = process.env.ADMIN_ALERT_EMAIL ?? DEFAULT_RECIPIENT;
  const fullSubject = `[DocFlow Alert] ${subject}`;

  if (!apiKey || !domain) {
    console.error(`ALERT: ${fullSubject}\n${body}`);
    return { delivered: false, via: "console" };
  }

  try {
    const from = process.env.MAILGUN_FROM ?? `DocFlow Alerts <alerts@${domain}>`;
    const auth = Buffer.from(`api:${apiKey}`).toString("base64");
    const form = new URLSearchParams();
    form.set("from", from);
    form.set("to", recipient);
    form.set("subject", fullSubject);
    form.set("text", body);

    const res = await fetch(`https://api.mailgun.net/v3/${domain}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      const err = `Mailgun ${res.status}: ${text.slice(0, 200)}`;
      console.error(`ALERT (mailgun failed): ${fullSubject}\n${body}\n${err}`);
      return { delivered: false, via: "console", error: err };
    }
    return { delivered: true, via: "mailgun" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`ALERT (exception): ${fullSubject}\n${body}\n${message}`);
    return { delivered: false, via: "console", error: message };
  }
}
