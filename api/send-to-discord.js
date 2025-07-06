export default async (req, res) => {
  const ALLOWED_USER_AGENT = "DebianSystemReporter/1.0";
  const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
  const SECURITY_WEBHOOK_URL = process.env.SECURITY_WEBHOOK_URL;

  if (!WEBHOOK_URL) {
    console.error("Missing configuration: DISCORD_WEBHOOK_URL");
    return res.status(500).json({ error: "Server configuration error" });
  }

  const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress || 'Unknown IP';
  const userAgent = req.headers['user-agent'] || 'Not provided';

  if (userAgent !== ALLOWED_USER_AGENT) {
    const alertMessage = `🚨 Unauthorized access attempt 🚨\n` +
                        `**IP:** ${ip}\n` +
                        `**User-Agent used:** ${userAgent}`;
    
    await sendSecurityAlert(alertMessage, SECURITY_WEBHOOK_URL);
    return res.status(403).json({ error: "Unauthorized access" });
  }

  if (req.method !== 'POST') {
    await sendSecurityAlert(
      `⚠️ ${req.method} attempt from IP: ${ip}`,
      SECURITY_WEBHOOK_URL
    );
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    
    if (!payload.embeds || payload.embeds.length === 0) {
      const details = `**IP:** ${ip}\n` +
                     `**Received payload:**\n\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\``;
      
      await sendSecurityAlert(
        "🚨 Attempt to send without embeds detected 🚨\n" + details,
        SECURITY_WEBHOOK_URL
      );

      await sendToDiscord(WEBHOOK_URL, {
        content: "⚠️ **Suspicious attempt detected** ⚠️",
        embeds: [{
          title: "Security Alert",
          description: "Someone tried to use the API without required data",
          color: 0xff0000,
          fields: [
            { name: "IP", value: ip },
            { name: "Payload", value: "```json\n" + JSON.stringify(payload, null, 2) + "\n```" }
          ],
          timestamp: new Date().toISOString()
        }]
      });

      return res.status(400).json({ error: "Invalid payload format" });
    }

    const response = await sendToDiscord(WEBHOOK_URL, payload);

    if (!response.ok) {
      throw new Error(`Discord error: ${response.status}`);
    }

    return res.status(200).json({ success: true, message: "Message sent successfully" });

  } catch (error) {
    console.error("Error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

async function sendSecurityAlert(message, webhookUrl) {
  if (!webhookUrl) {
    console.log("Security alert (webhook not configured):", message);
    return;
  }

  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: message,
        flags: 4
      })
    });
  } catch (e) {
    console.error("Failed to send security alert:", e);
  }
}

async function sendToDiscord(webhookUrl, payload) {
  return await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}
