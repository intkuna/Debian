import formidable from "formidable";
import fs from "fs";

export const config = {
  api: {
    bodyParser: false, // obligatoire pour formidable
  },
};

export default async function handler(req, res) {
  const ALLOWED_USER_AGENT = "DebianSystemReporter/1.0";
  const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
  const SECURITY_WEBHOOK_URL = process.env.SECURITY_WEBHOOK_URL;

  if (!WEBHOOK_URL) {
    return res.status(500).json({ error: "Server configuration error" });
  }

  const ip =
    req.headers["x-forwarded-for"] ||
    req.connection.remoteAddress ||
    "Unknown";
  const userAgent = req.headers["user-agent"] || "Not provided";

  const handleSecurityAlert = async (alertData) => {
    if (!SECURITY_WEBHOOK_URL) return;

    const embed = {
      title: alertData.title || "Security Alert",
      description: alertData.description,
      color: 0xff0000,
      fields: alertData.fields || [],
      timestamp: new Date().toISOString(),
    };

    await fetch(SECURITY_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ embeds: [embed] }),
    }).catch(console.error);
  };

  if (userAgent !== ALLOWED_USER_AGENT) {
    await handleSecurityAlert({
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

  if (req.method !== "POST") {
    await handleSecurityAlert({
      description: `Invalid HTTP method (${req.method}) used`,
      fields: [
        { name: "IP Address", value: ip },
        { name: "Expected Method", value: "POST" },
      ],
    });
    return res.status(405).json({ error: "Method not allowed" });
  }

  const form = formidable({ multiples: false });

  form.parse(req, async (err, fields, files) => {
    if (err) {
      console.error("Form parsing error:", err);
      return res.status(400).json({ error: "Bad Request" });
    }

    let embeds = [];

    try {
      if (fields.embeds) {
        embeds =
          typeof fields.embeds === "string"
            ? JSON.parse(fields.embeds)
            : fields.embeds;
      }

      if (!Array.isArray(embeds) || embeds.length === 0) {
        await handleSecurityAlert({
          title: "Invalid Payload Structure",
          description: "Attempt to send message without embeds",
          fields: [
            { name: "IP Address", value: ip },
            { name: "Raw Embeds", value: JSON.stringify(fields.embeds) },
          ],
        });
        return res.status(400).json({ error: "Invalid embeds" });
      }
    } catch (e) {
      console.error("Invalid embed JSON:", e);
      return res.status(400).json({ error: "Invalid embed JSON format" });
    }

    const payload = { embeds };

    // Gérer le fichier si présent
    if (files.file) {
      try {
        const file = files.file;
        const fileData = fs.readFileSync(file.filepath);

        // Préparer form-data pour Discord
        const formData = new FormData();
        formData.append("file", new Blob([fileData]), file.originalFilename);
        formData.append("payload_json", JSON.stringify(payload));

        const response = await fetch(WEBHOOK_URL, {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          const text = await response.text();
          console.error(`Discord API error ${response.status}:`, text);
          throw new Error(`Discord API responded with ${response.status}`);
        }

        return res.status(200).json({ success: true });
      } catch (error) {
        console.error("Discord webhook error:", error);
        return res.status(500).json({ error: "Failed to send to Discord" });
      }
    } else {
      // Pas de fichier, envoi JSON classique
      try {
        const response = await fetch(WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const text = await response.text();
          console.error(`Discord API error ${response.status}:`, text);
          throw new Error(`Discord API responded with ${response.status}`);
        }

        return res.status(200).json({ success: true });
      } catch (error) {
        console.error("Discord webhook error:", error);
        return res.status(500).json({ error: "Failed to send to Discord" });
      }
    }
  });
}
