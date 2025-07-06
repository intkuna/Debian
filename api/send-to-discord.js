// /api/send-to-discord.js
export default async (req, res) => {
  // 1. Configuration
  const ALLOWED_USER_AGENT = "DebianSystemReporter/1.0";
  const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

  // 2. Vérification des prérequis
  if (!WEBHOOK_URL) {
    console.error("DISCORD_WEBHOOK_URL environment variable is not set");
    return res.status(500).json({ 
      error: "Server configuration error",
      details: "Webhook URL not configured"
    });
  }

  // 3. Validation du User-Agent
  const userAgent = req.headers['user-agent'];
  if (userAgent !== ALLOWED_USER_AGENT) {
    console.warn(`Unauthorized access attempt with User-Agent: ${userAgent}`);
    return res.status(403).json({ 
      error: "Unauthorized",
      details: "Invalid User-Agent header"
    });
  }

  // 4. Validation de la méthode HTTP
  if (req.method !== 'POST') {
    return res.status(405).json({ 
      error: "Method not allowed",
      allowed_methods: ["POST"]
    });
  }

  // 5. Validation du corps de la requête
  let payload;
  try {
    payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    if (!payload || typeof payload !== 'object') {
      throw new Error("Invalid payload format");
    }
  } catch (e) {
    return res.status(400).json({
      error: "Bad request",
      details: "Invalid JSON payload",
      required_format: "application/json"
    });
  }

  // 6. Envoi à Discord
  try {
    const discordResponse = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!discordResponse.ok) {
      const errorBody = await discordResponse.text();
      console.error(`Discord API error: ${discordResponse.status} - ${errorBody}`);
      return res.status(502).json({
        error: "Bad gateway",
        details: "Discord API returned an error",
        discord_status: discordResponse.status,
        discord_response: errorBody
      });
    }

    // 7. Réponse succès
    return res.status(200).json({ 
      success: true,
      message: "Payload forwarded to Discord successfully"
    });

  } catch (error) {
    console.error("API processing error:", error);
    return res.status(500).json({
      error: "Internal server error",
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};
