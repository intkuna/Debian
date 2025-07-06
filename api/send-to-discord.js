export default async (req, res) => {
  const ALLOWED_USER_AGENT = "DebianSystemReporter/1.0";
  const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
  const SECURITY_WEBHOOK_URL = process.env.SECURITY_WEBHOOK_URL;

  if (!WEBHOOK_URL) {
    return res.status(500).json({ error: "Server configuration error" });
  }

  const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress || 'Unknown';
  const userAgent = req.headers['user-agent'] || 'Not provided';

  const handleSecurityAlert = async (alertData) => {
    if (!SECURITY_WEBHOOK_URL) return;
    
    const embed = {
      title: alertData.title || "Security Alert",
      description: alertData.description,
      color: 0xff0000,
      fields: alertData.fields || [],
      timestamp: new Date().toISOString()
    };

    await fetch(SECURITY_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds: [embed] })
    }).catch(console.error);
  };

  if (userAgent !== ALLOWED_USER_AGENT) {
    await handleSecurityAlert({
      title: "Unauthorized Access Attempt",
      description: "Invalid User-Agent detected",
      fields: [
        { name: "IP Address", value: ip, inline: true },
        { name: "User-Agent", value: userAgent, inline: true },
        { name: "Endpoint", value: req.url, inline: true }
      ]
    });
    return res.status(403).json({ error: "Unauthorized" });
  }

  if (req.method !== 'POST') {
    await handleSecurityAlert({
      description: `Invalid HTTP method (${req.method}) used`,
      fields: [
        { name: "IP Address", value: ip },
        { name: "Expected Method", value: "POST" }
      ]
    });
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

    if (!payload.embeds?.length) {
      await handleSecurityAlert({
        title: "Invalid Payload Structure",
        description: "Attempt to send message without embeds",
        fields: [
          { name: "IP Address", value: ip },
          { name: "Payload", value: `\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\`` }
        ]
      });
      return res.status(400).json({ error: "Invalid payload format" });
    }

    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Discord API responded with ${response.status}`);
    }

    return res.status(200).json({ success: true });

  } catch (error) {
    console.error(`Processing error: ${error.message}`);
    return res.status(500).json({ error: "Internal server error" });
  }
};
