import multer from 'multer';
import fetch from 'node-fetch';
import FormData from 'form-data';

// Configure multer for memory storage (handles multipart parsing)
const upload = multer({ storage: multer.memoryStorage() });

// Helper to process multipart requests
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

  // Security checks
  const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  const userAgent = req.headers['user-agent'] || '';

  const sendSecurityAlert = async (alertData) => {
    if (!SECURITY_WEBHOOK_URL) return;
    
    await fetch(SECURITY_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        embeds: [{
          title: alertData.title || "Security Alert",
          description: alertData.description,
          color: 0xff0000,
          fields: alertData.fields || [],
          timestamp: new Date().toISOString()
        }]
      })
    }).catch(console.error);
  };

  // 1. Verify User-Agent
  if (userAgent !== ALLOWED_USER_AGENT) {
    await sendSecurityAlert({
      title: "Unauthorized Access Attempt",
      description: `Blocked request from ${ip}`,
      fields: [
        { name: "User-Agent", value: userAgent || "None" },
        { name: "Endpoint", value: req.url }
      ]
    });
    return res.status(403).json({ error: "Unauthorized" });
  }

  // 2. Verify HTTP Method
  if (req.method !== 'POST') {
    await sendSecurityAlert({
      description: `Invalid method: ${req.method}`,
      fields: [
        { name: "IP", value: ip },
        { name: "Expected", value: "POST" }
      ]
    });
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    let payload;
    let files = [];

    // 3. Parse request based on Content-Type
    if (req.headers['content-type']?.includes('multipart/form-data')) {
      // Handle multipart (Go client)
      const processedReq = await processMultipart(req, res);
      payload = JSON.parse(processedReq.body.payload_json || '{}');
      files = processedReq.files || [];
    } else {
      // Handle JSON (normal requests)
      payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    }

    // 4. Validate payload
    if (!payload.embeds || !Array.isArray(payload.embeds)) {
      await sendSecurityAlert({
        title: "Invalid Payload",
        description: "Missing or invalid 'embeds' array",
        fields: [
          { name: "IP", value: ip },
          { name: "Payload", value: JSON.stringify(payload).slice(0, 1000) }
        ]
      });
      return res.status(400).json({ error: "Payload must contain 'embeds' array" });
    }

    // 5. Forward to Discord
    const discordForm = new FormData();
    discordForm.append('payload_json', JSON.stringify(payload));
    
    // Attach files if present
    files.forEach(file => {
      discordForm.append('file', file.buffer, {
        filename: file.originalname,
        contentType: file.mimetype
      });
    });

    const discordResponse = await fetch(WEBHOOK_URL, {
      method: 'POST',
      body: discordForm
    });

    if (!discordResponse.ok) {
      const errorText = await discordResponse.text();
      throw new Error(`Discord error: ${discordResponse.status} - ${errorText}`);
    }

    return res.status(200).json({ success: true });

  } catch (error) {
    console.error('[API Error]', error.message);
    await sendSecurityAlert({
      title: "Processing Error",
      description: error.message,
      fields: [
        { name: "IP", value: ip },
        { name: "Stack", value: error.stack?.split('\n')[0] || 'No stack' }
      ]
    });
    return res.status(500).json({ error: "Internal server error" });
  }
};
