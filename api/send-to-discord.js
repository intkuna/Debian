export default async (req, res) => {
  const ALLOWED_USER_AGENT = "DebianSystemReporter/1.0";
  const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

  // Vérification de la configuration
  if (!WEBHOOK_URL) {
    return res.status(500).json({ 
      error: "Server configuration error",
      details: "Webhook URL not configured"
    });
  }

  // Validation du User-Agent
  const userAgent = req.headers['user-agent'];
  if (userAgent !== ALLOWED_USER_AGENT) {
    return res.status(403).json({ 
      error: "Unauthorized",
      details: "Invalid User-Agent header"
    });
  }

  // Validation de la méthode
  if (req.method !== 'POST') {
    return res.status(405).json({ 
      error: "Method not allowed",
      allowed_methods: ["POST"]
    });
  }

  // Traitement du payload
  let payload;
  try {
    payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    
    // Formatage pour Discord
    const discordPayload = {
      content: "Nouveau rapport système",
      embeds: [{
        title: "Rapport Système",
        description: `Système: ${payload.system || 'Inconnu'}\nStatut: ${payload.status || 'Inconnu'}`,
        color: 0x00ff00,
        timestamp: new Date().toISOString()
      }]
    };

    // Envoi à Discord
    const discordResponse = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(discordPayload)
    });

    if (!discordResponse.ok) {
      const errorBody = await discordResponse.text();
      throw new Error(`Discord API error: ${discordResponse.status} - ${errorBody}`);
    }

    return res.status(200).json({ 
      success: true,
      message: "Message envoyé à Discord avec succès"
    });

  } catch (error) {
    console.error("Error:", error);
    return res.status(500).json({
      error: "Internal server error",
      details: error.message
    });
  }
};
