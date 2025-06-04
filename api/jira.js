export default async function handler(req, res) {
  // Add CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // Handle preflight requests
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const { filter = "full",from, to, operation } = req.query;
  const email = process.env.JIRA_EMAIL;
  const token = process.env.JIRA_TOKEN;
  const auth = Buffer.from(`${email}:${token}`).toString("base64");

    // Helper: format date as YYYY-MM-DD
  const formatDate = (date) => {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };
  const today = new Date();

  const projectKey = operation === "true" ? "Operation Team" : "GMEBiz";

  // Build JQL
  let jql = `project=${projectKey}`;
  if (filter === "weekly") {
    const todayFormatted = formatDate(today);
    // Get last week's Sunday
    const day = today.getDay(); // 0 (Sun) to 6 (Sat)
    const lastSunday = new Date(today);
    lastSunday.setDate(today.getDate() - day - 7);
    jql += ` AND "Start date[Date]" >= "${formatDate(lastSunday)}" AND "Start date[Date]" <= "${todayFormatted}"`;

  } else if (filter === "monthly") {
    const lastMonthFirstDay = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    jql += ` AND "Start date[Date]" >= "${formatDate(lastMonthFirstDay)}" AND "Start date[Date]" <= "${todayFormatted}"`;
  } else if(filter === "custom" && from && to) {
    jql += ` AND "Start date[Date]" >= "${formatDate(from)}" AND "Start date[Date]" <= "${formatDate(to)}"`;
  }
  jql += " ORDER BY created DESC";

  const maxResults = 100;
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
