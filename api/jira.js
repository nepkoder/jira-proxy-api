export default async function handler(req, res) {
  // Add CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // Handle preflight requests
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const { filter = "full" } = req.query; // Default to 'full' if not provided
  const email = process.env.JIRA_EMAIL;
  const token = process.env.JIRA_TOKEN;
  const auth = Buffer.from(`${email}:${token}`).toString("base64");

  // Base JQL
  let jql = "project=GMEBiz";

  // Add time-based filters
  if (filter === "weekly") {
    jql += " AND updated >= -7d";
  } else if (filter === "monthly") {
    jql += " AND updated >= -30d";
  }

  // Add sorting
  jql += " ORDER BY key DESC";

  try {
    const url = `https://gmeremit-team.atlassian.net/rest/api/3/search?` + 
      new URLSearchParams({
        jql: jql,
        maxResults: "1000",
      });

    const response = await fetch(url, {
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: "application/json",
      },
    });

    const data = await response.json();
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: "Jira API error", message: err.message });
  }
}
