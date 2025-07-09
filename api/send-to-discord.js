import fetch from 'node-fetch';
import FormData from 'form-data';
import multer from 'multer';

// Multer setup: store files in memory for immediate upload (no disk I/O)
const upload = multer({ storage: multer.memoryStorage() });

// Helper to promisify multer middleware
function runMulter(req, res) {
  return new Promise((resolve, reject) => {
    upload.any()(req, res, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

const ALLOWED_USER_AGENT = "DebianSystemReporter/1.0";
const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const SECURITY_WEBHOOK_URL = process.env.SECURITY_WEBHOOK_URL;

/**
 * API handler for forwarding messages and attachments to Discord webhook.
 * Supports JSON body or multipart/form-data with attachments.
 */
export default async function handler(req, res) {
  if (!WEBHOOK_URL) {
    return res.status(500).json({ error: "Server configuration error: WEBHOOK_URL not set" });
  }

  const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress || 'Unknown';
  const userAgent = req.headers['user-agent'] || 'Not provided';

  /**
   * Sends a security alert to the SECURITY_WEBHOOK_URL (if configured).
   */
  async function handleSecurityAlert(alertData) {
    if (!SECURITY_WEBHOOK_URL) return;

    const embed = {
      title: alertData.title || "Security Alert",
      description: alertData.description || "",
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
  }

  // Security check: enforce specific User-Agent
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

  // Only allow POST requests
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
    const contentType = req.headers['content-type'] || '';

    let payload = null;
    let attachments = [];

    if (contentType.startsWith('multipart/form-data')) {
      // Parse multipart form with multer
      await runMulter(req, res);

      // Expect the JSON payload in 'payload_json' field
      const payloadJsonStr = req.body.payload_json;
      if (!payloadJsonStr) {
        return res.status(400).json({ error: "Missing 'payload_json' field in multipart form data" });
      }

      try {
        payload = JSON.parse(payloadJsonStr);
      } catch {
        return res.status(400).json({ error: "Invalid JSON in 'payload_json' field" });
      }

      // Collect files for Discord attachments
      if (req.files && req.files.length > 0) {
        attachments = req.files.map((file, idx) => ({
          id: idx,
          filename: file.originalname,
          contentType: file.mimetype,
          buffer: file.buffer,
        }));

        // Add attachment metadata to payload as Discord expects
        payload.attachments = attachments.map(file => ({
          id: file.id,
          filename: file.filename,
        }));
      }

    } else if (contentType.includes('application/json')) {
      // Parse JSON body directly
      payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

      // Validate minimal payload requirement (embeds)
      if (!payload.embeds?.length) {
        await handleSecurityAlert({
          title: "Invalid Payload Structure",
          description: "Attempt to send message without embeds",
          fields: [
            { name: "IP Address", value: ip },
            { name: "Payload", value: `\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\`` }
          ]
        });
        return res.status(400).json({ error: "Invalid payload format: embeds array required" });
      }
    } else {
      return res.status(415).json({ error: `Unsupported Content-Type: ${contentType}` });
    }

    // Send data to Discord webhook
    let discordResponse;

    if (attachments.length > 0) {
      // Build multipart form-data for Discord webhook with attachments
      const form = new FormData();
      form.append('payload_json', JSON.stringify(payload));

      attachments.forEach(file => {
        form.append(`files[${file.id}]`, file.buffer, {
          filename: file.filename,
          contentType: file.contentType,
        });
      });

      discordResponse = await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: form.getHeaders(),
        body: form
      });
    } else {
      // Send JSON payload only
      discordResponse = await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    }

    if (!discordResponse.ok) {
      const text = await discordResponse.text();
      throw new Error(`Discord API error ${discordResponse.status}: ${text}`);
    }

    return res.status(200).json({ success: true });

  } catch (error) {
    console.error("Internal processing error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
