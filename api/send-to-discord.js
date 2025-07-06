import multer from 'multer';
import fetch from 'node-fetch';

// Configure multer (5MB file limit, 2 fields max)
const upload = multer({ 
  limits: { 
    fileSize: 5 * 1024 * 1024,
    fields: 2 // payload_json + file
  } 
});

export default async (req, res) => {
  const ALLOWED_USER_AGENT = "DebianSystemReporter/1.0";
  const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
  const SECURITY_WEBHOOK_URL = process.env.SECURITY_WEBHOOK_URL;

  if (!WEBHOOK_URL) {
    return res.status(500).json({ error: "Server configuration error" });
  }

  // Security logging function
  const sendSecurityAlert = async (alertData) => {
    if (!SECURITY_WEBHOOK_URL) return;
    
    const embed = {
      title: alertData.title || "⚠️ Security Alert",
      description: alertData.description,
      color: 0xff0000,
      fields: alertData.fields || [],
      timestamp: new Date().toISOString()
    };

    try {
      await fetch(SECURITY_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ embeds: [embed] })
      });
    } catch (err) {
      console.error("Failed to send security alert:", err);
    }
  };

  // Get client info for security logging
  const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress || 'Unknown';
  const userAgent = req.headers['user-agent'] || 'Not provided';

  // Block invalid User-Agent
  if (userAgent !== ALLOWED_USER_AGENT) {
    await sendSecurityAlert({
      title: "🚨 Unauthorized Access Attempt",
      description: "Invalid User-Agent detected",
      fields: [
        { name: "IP Address", value: ip, inline: true },
        { name: "User-Agent", value: userAgent, inline: true },
        { name: "Endpoint", value: req.url, inline: true }
      ]
    });
    return res.status(403).json({ error: "Unauthorized" });
  }

  // Block non-POST requests
  if (req.method !== 'POST') {
    await sendSecurityAlert({
      title: "⚠️ Invalid Request Method",
      description: `Expected POST, received ${req.method}`,
      fields: [
        { name: "IP Address", value: ip },
        { name: "Method", value: req.method }
      ]
    });
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // Parse multipart request
    const formData = await new Promise((resolve, reject) => {
      upload.fields([
        { name: 'payload_json', maxCount: 1 },
        { name: 'file', maxCount: 1 }
      ])(req, res, (err) => {
        if (err) {
          // Handle file size errors
          if (err.code === 'LIMIT_FILE_SIZE') {
            reject(new Error("File too large (max 5MB)"));
          } else {
            reject(err);
          }
        } else {
          resolve({
            payload: req.body.payload_json?.[0], // JSON string
            file: req.files?.file?.[0] // Screenshot (if provided)
          });
        }
      });
    });

    // Validate payload exists
    if (!formData.payload) {
      await sendSecurityAlert({
        title: "⚠️ Invalid Payload",
        description: "Missing payload_json field",
        fields: [
          { name: "IP Address", value: ip }
        ]
      });
      return res.status(400).json({ error: "Missing payload_json" });
    }

    // Parse and validate JSON structure
    let payload;
    try {
      payload = JSON.parse(formData.payload);
    } catch (err) {
      await sendSecurityAlert({
        title: "⚠️ Invalid JSON",
        description: "Failed to parse payload_json",
        fields: [
          { name: "IP Address", value: ip },
          { name: "Payload", value: `\`\`\`${formData.payload.slice(0, 500)}\`\`\`` }
        ]
      });
      return res.status(400).json({ error: "Invalid JSON in payload" });
    }

    // Validate embeds exist
    if (!payload.embeds?.length) {
      await sendSecurityAlert({
        title: "⚠️ Invalid Payload Structure",
        description: "Missing required 'embeds' field",
        fields: [
          { name: "IP Address", value: ip }
        ]
      });
      return res.status(400).json({ error: "Missing embeds in payload" });
    }

    // Forward to Discord webhook
    const discordResponse = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!discordResponse.ok) {
      const errorText = await discordResponse.text();
      throw new Error(`Discord API error: ${discordResponse.status} - ${errorText}`);
    }

    return res.status(200).json({ success: true });

  } catch (error) {
    console.error(`API Processing Error: ${error.message}`);
    
    await sendSecurityAlert({
      title: "⚠️ API Processing Error",
      description: error.message,
      fields: [
        { name: "IP Address", value: ip },
        { name: "Stack", value: `\`\`\`${error.stack?.split('\n').slice(0, 3).join('\n')}\`\`\`` }
      ]
    });

    return res.status(500).json({ 
      error: "Internal server error",
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};
