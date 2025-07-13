import formidable from 'formidable';
import fs from 'fs';
import path from 'path';

export const config = {
  api: {
    bodyParser: false,
  },
};

const ALLOWED_USER_AGENT = "DebianSystemReporter/1.0";
const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const SECURITY_WEBHOOK_URL = process.env.SECURITY_WEBHOOK_URL;

async function sendSecurityAlert(alertData) {
  if (!SECURITY_WEBHOOK_URL) return;

  const embed = {
    title: alertData.title || "Security Alert",
    description: alertData.description || '',
    color: 0xff0000,
    fields: alertData.fields || [],
    timestamp: new Date().toISOString(),
  };

  try {
    await fetch(SECURITY_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds: [embed] }),
    });
  } catch (err) {
    console.error("Failed to send security alert:", err);
  }
}

export default async function handler(req, res) {
  const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress || 'Unknown';
  const userAgent = req.headers['user-agent'] || 'Not provided';

  if (!WEBHOOK_URL) {
    console.error("DISCORD_WEBHOOK_URL not configured.");
    return res.status(500).json({ error: "Server configuration error" });
  }

  if (userAgent !== ALLOWED_USER_AGENT) {
    await sendSecurityAlert({
      title: "Unauthorized Access Attempt",
      description: "Invalid User-Agent detected",
      fields: [
        { name: "IP Address", value: ip, inline: true },
        { name: "User-Agent", value: userAgent, inline: true },
        { name: "Endpoint", value: req.url, inline: true },
      ],
    });
    return res.status(403).json({ error: "Unauthorized" });
  }

  if (req.method !== 'POST') {
    await sendSecurityAlert({
      description: `Invalid HTTP method (${req.method}) used`,
      fields: [
        { name: "IP Address", value: ip },
        { name: "Expected Method", value: "POST" },
      ],
    });
    return res.status(405).json({ error: "Method not allowed" });
  }

  const form = new formidable.IncomingForm({ multiples: true, keepExtensions: true });

  form.parse(req, async (err, fields, files) => {
    if (err) {
      console.error("Error parsing form data:", err);
      return res.status(400).json({ error: "Invalid form data" });
    }

    try {
      if (!fields.embeds) {
        await sendSecurityAlert({
          title: "Invalid Payload Structure",
          description: "Missing 'embeds' field in form data",
          fields: [{ name: "IP Address", value: ip }],
        });
        return res.status(400).json({ error: "Missing embeds field" });
      }

      let embeds;
      try {
        embeds = JSON.parse(fields.embeds);
      } catch (parseErr) {
        await sendSecurityAlert({
          title: "Invalid Payload Structure",
          description: "Invalid JSON in embeds field",
          fields: [
            { name: "IP Address", value: ip },
            { name: "Embeds Data", value: fields.embeds.substring(0, 1000) },
          ],
        });
        return res.status(400).json({ error: "Invalid JSON in embeds" });
      }

      if (!Array.isArray(embeds) || embeds.length === 0) {
        await sendSecurityAlert({
          title: "Invalid Payload Structure",
          description: "Embeds field must be a non-empty array",
          fields: [{ name: "IP Address", value: ip }],
        });
        return res.status(400).json({ error: "Invalid embeds format" });
      }

      const formData = new FormData();
      formData.append("payload_json", JSON.stringify({ embeds }));

      const filesArray = [];
      if (files.file) {
        if (Array.isArray(files.file)) {
          filesArray.push(...files.file);
        } else {
          filesArray.push(files.file);
        }
      }

      for (const file of filesArray) {
        if (!file || !file.filepath) continue;
        const stream = fs.createReadStream(file.filepath);
        formData.append("files[]", stream, file.originalFilename || path.basename(file.filepath));
      }

      const discordResponse = await fetch(WEBHOOK_URL, {
        method: 'POST',
        body: formData,
      });

      if (!discordResponse.ok) {
        const text = await discordResponse.text();
        console.error("Discord webhook error:", discordResponse.status, text);
        return res.status(502).json({ error: "Failed to send to Discord" });
      }

      return res.status(200).json({ success: true });
    } catch (error) {
      console.error("Processing error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });
}
