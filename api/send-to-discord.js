export default async (req, res) => {
  const ALLOWED_USER_AGENT = "DebianSystemReporter/1.0";
  const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

  if (!WEBHOOK_URL) {
    return res.status(500).json({ 
      error: "Server configuration error",
      details: "Webhook URL not configured"
    });
  }

  const userAgent = req.headers['user-agent'];
  if (userAgent !== ALLOWED_USER_AGENT) {
    return res.status(403).json({ 
      error: "Unauthorized",
      details: "Invalid User-Agent header"
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ 
      error: "Method not allowed",
      allowed_methods: ["POST"]
    });
  }

  let payload;
  try {
    payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    
    // Format entièrement personnalisable - À adapter dans votre .go
    const discordPayload = {
      content: payload.content || null, // Texte brut au-dessus de l'embed
      embeds: payload.embeds || [ // Structure complète des embeds
        {
          title: payload.title || "Rapport Système",
          description: payload.description || "Aucune description fournie",
          color: payload.color || 0x00ff00,
          fields: payload.fields || [], // Champs personnalisés
          timestamp: payload.timestamp || new Date().toISOString(),
          footer: payload.footer || { text: "Généré automatiquement" }
        }
      ]
    };

    const discordResponse = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(discordPayload)
    });

    if (!discordResponse.ok) {
      const errorBody = await discordResponse.text();
      throw new Error(`Discord API error: ${discordResponse.status} - ${errorBody}`);
    }

    return res.status(200).json({ success: true });

  } catch (error) {
    console.error("Error:", error);
    return res.status(500).json({
      error: "Internal server error",
      details: error.message
    });
  }
};
