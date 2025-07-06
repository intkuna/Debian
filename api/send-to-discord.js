export default async (req, res) => {
  const ALLOWED_USER_AGENT = "DebianSystemReporter/1.0";
  const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
  const SECURITY_WEBHOOK_URL = process.env.SECURITY_WEBHOOK_URL; // Webhook pour les alertes de sécurité

  // Vérification de base
  if (!WEBHOOK_URL) {
    console.error("Configuration manquante: DISCORD_WEBHOOK_URL");
    return res.status(500).json({ error: "Server configuration error" });
  }

  // Vérification du User-Agent
  const userAgent = req.headers['user-agent'];
  if (userAgent !== ALLOWED_USER_AGENT) {
    await logSecurityAttempt(req, "Tentative d'accès avec User-Agent invalide", SECURITY_WEBHOOK_URL);
    return res.status(403).json({ error: "Unauthorized" });
  }

  // Vérification de la méthode
  if (req.method !== 'POST') {
    await logSecurityAttempt(req, "Tentative avec méthode non autorisée", SECURITY_WEBHOOK_URL);
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const payload = parsePayload(req.body);
    
    // Détection des tentatives suspectes
    if (!hasValidEmbeds(payload)) {
      await logSecurityAttempt(req, "Tentative sans embed détectée", SECURITY_WEBHOOK_URL);
      
      // Envoi d'un message spécial au webhook principal
      await sendSecurityAlert(WEBHOOK_URL, req);
      
      return res.status(400).json({ error: "Invalid payload format" });
    }

    // Envoi normal à Discord
    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Discord API error: ${response.status}`);
    }

    return res.status(200).json({ success: true });

  } catch (error) {
    console.error("Error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// Fonctions utilitaires
async function logSecurityAttempt(req, reason, securityWebhook) {
  const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  console.warn(`SECURITY: ${reason} from IP: ${ip}`);

  if (securityWebhook) {
    const alertData = {
      content: `⚠️ **Tentative d'accès suspecte détectée**`,
      embeds: [{
        title: "Alerte de sécurité",
        description: reason,
        color: 0xff0000,
        fields: [
          { name: "IP", value: ip || "Inconnue" },
          { name: "Méthode", value: req.method },
          { name: "User-Agent", value: req.headers['user-agent'] || "Non fourni" }
        ],
        timestamp: new Date().toISOString()
      }]
    };

    try {
      await fetch(securityWebhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(alertData)
      });
    } catch (e) {
      console.error("Failed to send security alert:", e);
    }
  }
}

function parsePayload(body) {
  return typeof body === 'string' ? JSON.parse(body) : body;
}

function hasValidEmbeds(payload) {
  // Vérifie que le payload contient au moins un embed valide
  return payload.embeds?.length > 0 || 
         (payload.title && payload.description); // Ou des champs minimum
}

async function sendSecurityAlert(webhookUrl, req) {
  const alertPayload = {
    content: "🚨 **Tentative d'accès suspecte détectée** 🚨",
    embeds: [{
      title: "Activité suspecte",
      description: "Quelqu'un a tenté d'utiliser l'API sans fournir les données requises",
      color: 0xff0000,
      fields: [
        { name: "IP", value: req.headers['x-forwarded-for'] || "Inconnue" },
        { name: "Payload", value: "```json\n" + JSON.stringify(req.body, null, 2) + "\n```" }
      ],
      timestamp: new Date().toISOString()
    }]
  };

  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(alertPayload)
    });
  } catch (e) {
    console.error("Failed to send main webhook alert:", e);
  }
}
