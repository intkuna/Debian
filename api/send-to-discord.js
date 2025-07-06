import multer from 'multer';
import fetch from 'node-fetch';

// Configure multer for multipart parsing (memory storage)
const upload = multer({ storage: multer.memoryStorage() });

// Helper to process multipart/form-data
const processMultipart = (req, res) => new Promise((resolve, reject) => {
  upload.any()(req, res, (err) => {
    if (err) reject(err);
    else resolve(req);
  });
});

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

  // Auth & method checks
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
    let payload;
    let files = [];

    // Handle multipart (Go client)
    if (req.headers['content-type']?.includes('multipart/form-data')) {
      const processedReq = await processMultipart(req, res);
      
      // Extract JSON payload
      if (processedReq.body?.payload_json) {
        payload = JSON.parse(processedReq.body.payload_json);
      } else {
        throw new Error("Missing payload_json in multipart request");
      }

      // Extract files (e.g., screenshot)
      files = processedReq.files || [];
    } 
    // Handle raw JSON (standard Discord webhooks)
    else {
      payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    }

    // Validate payload
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

    // Forward to Discord (with files if available)
    const formData = new FormData();
    formData.append('payload_json', JSON.stringify(payload));

    if (files.length > 0) {
      files.forEach(file => {
        formData.append(file.fieldname, file.buffer, file.originalname);
      });
    }

    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      body: formData
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
