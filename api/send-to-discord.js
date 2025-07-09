import fetch from 'node-fetch'; // if you are in Node.js, else native fetch in modern env
import FormData from 'form-data';
import multer from 'multer';

// Multer config for memory storage (no disk)
const upload = multer({ storage: multer.memoryStorage() });

// Helper: run multer middleware as a promise
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

export default async function handler(req, res) {
  if (!WEBHOOK_URL) {
    return res.status(500).json({ error: "Server configuration error" });
  }

  const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress || 'Unknown';
  const userAgent = req.headers['user-agent'] || 'Not provided';

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
      console.error("Security alert webhook failed:", err);
    }
  }

  // Security check - user agent
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
    // Parse multipart/form-data (with files) OR JSON body
    let payload = null;
    let attachments = [];

    const contentType = req.headers['content-type'] || '';

    if (contentType.startsWith('multipart/form-data')) {
      await runMulter(req, res);

      // Expect a field named "payload_json" with the Discord payload JSON (embeds, content, etc)
      const payloadJsonStr = req.body.payload_json;
      if (!payloadJsonStr) {
        return res.status(400).json({ error: "Missing payload_json in multipart form data" });
      }

      try {
        payload = JSON.parse(payloadJsonStr);
      } catch {
        return res.status(400).json({ error: "Invalid JSON in payload_json field" });
      }

      // Collect files as Discord attachments
      if (req.files && req.files.length > 0) {
        attachments = req.files.map((file, idx) => ({
          id: idx,
          filename: file.originalname,
          contentType: file.mimetype,
          buffer: file.buffer,
        }));

        // Discord expects 'attachments' array in payload with id/filename references
        payload.attachments = attachments.map(a => ({
          id: a.id,
          filename: a.filename,
        }));
      }

    } else if (contentType.includes('application/json')) {
      payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

      if (!payload.embeds?.length) {
        await handleSecurityAlert({
          title: "Invalid Payload Structure",
          description: "Attempt to send message without embeds",
          fields: [
            { name: "IP Address", value: ip },
            { name: "Payload", value: `\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\`` }
          ]
        });
        return res.status(400).json({ error: "Invalid payload format: embeds required" });
      }
    } else {
      return res.status(415).json({ error: "Unsupported content type" });
    }

    // Send to Discord webhook
    let discordResponse;

    if (attachments.length > 0) {
      // Send multipart/form-data with attachments

      const form = new FormData();
      form.append('payload_json', JSON.stringify(payload));

      // Attach files
      attachments.forEach((file) => {
        form.append('files[' + file.id + ']', file.buffer, {
          filename: file.filename,
          contentType: file.contentType,
        });
      });

      discordResponse = await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: form.getHeaders(),
        body: form,
      });

    } else {
      // Just JSON
      discordResponse = await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    }

    if (!discordResponse.ok) {
      throw new Error(`Discord API responded with status ${discordResponse.status}`);
    }

    return res.status(200).json({ success: true });

  } catch (error) {
    console.error("Processing error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
