// /api/send-to-discord.js
export default async (req, res) => {
  // Define your custom User-Agent
  const ALLOWED_USER_AGENT = "DebianSystemReporter/1.0";
  
  // Your Discord webhook URL (store as environment variable in Vercel)
  const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

  // Check for correct User-Agent
  const userAgent = req.headers['user-agent'];
  if (userAgent !== ALLOWED_USER_AGENT) {
    return res.status(403).json({ error: "Unauthorized" });
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // Forward the payload to Discord
    const discordResponse = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(req.body),
    });

    if (!discordResponse.ok) {
      throw new Error(`Discord API responded with ${discordResponse.status}`);
    }

    res.status(200).json({ success: true });
  } catch (error) {
    console.error("Error forwarding to Discord:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};