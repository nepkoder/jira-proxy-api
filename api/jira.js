export default async function handler(req, res) {
  // Add CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // Handle preflight requests
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const { filter = "full" } = req.query;
  const email = process.env.JIRA_EMAIL;
  const token = process.env.JIRA_TOKEN;
  const auth = Buffer.from(`${email}:${token}`).toString("base64");

  // Build JQL
  let jql = "project=GMEBiz";
  if (filter === "weekly") {
    jql += " AND 'Start date[Date]' >= -7d";
  } else if (filter === "monthly") {
    jql += " AND 'Start date[Date]' >= -30d";
  }
  jql += " ORDER BY key DESC";

  const maxResults = 10000;
  let startAt = 0;
  let allIssues = [];

  try {
    while (true) {
      const url = `https://gmeremit-team.atlassian.net/rest/api/3/search?` + 
        new URLSearchParams({
          jql,
          maxResults: maxResults.toString(),
          startAt: startAt.toString(),
        });

      const response = await fetch(url, {
        headers: {
          Authorization: `Basic ${auth}`,
          Accept: "application/json",
        },
      });

      const data = await response.json();

      if (!data.issues) {
        return res.status(500).json({ error: "Unexpected Jira response", data });
      }

      allIssues.push(...data.issues);

      if (data.startAt + data.maxResults >= data.total) {
        break; // Fetched all
      }

      startAt += maxResults;
    }

    res.status(200).json({
      total: allIssues.length,
      issues: allIssues,
    });

  } catch (err) {
    res.status(500).json({ error: "Jira API error", message: err.message });
  }
}
