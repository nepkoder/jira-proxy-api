export default async function handler(req, res) {
  // CORS Headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const { filter = "full", from, to, mode, assignee = "All" } = req.query;
  const email = process.env.JIRA_EMAIL;
  const token = process.env.JIRA_TOKEN;

  if (!email || !token) {
    return res.status(500).json({ error: "Jira credentials not set in environment variables" });
  }

  const auth = Buffer.from(`${email}:${token}`).toString("base64");

  // Helper: format date as YYYY-MM-DD
  const formatDate = (date) => {
    if (typeof date === "string") return date; // already in string format
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  };

  const today = new Date();
  const todayFormatted = formatDate(today);

  // Build JQL
  let jql = `project in (${mode == "operation" ? "OT" : mode == "GAT" ? "GAT" : "GBP"})`;

  if (filter === "weekly") {
    const day = today.getDay(); // 0 (Sun) to 6 (Sat)
    const lastSunday = new Date(today);
    lastSunday.setDate(today.getDate() - day - 7);
    jql += ` AND "Start date[Date]" >= "${formatDate(lastSunday)}" AND "Start date[Date]" <= "${todayFormatted}"`;

  } else if (filter === "monthly") {
    const lastMonthFirstDay = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    jql += ` AND "Start date[Date]" >= "${formatDate(lastMonthFirstDay)}" AND "Start date[Date]" <= "${todayFormatted}"`;

  } else if (filter === "custom" && from && to) {
    jql += ` AND "Start date[Date]" >= "${formatDate(from)}" AND "Start date[Date]" <= "${formatDate(to)}"`;
  }

  if (assignee !== "All") {
    jql += ` AND assignee = "${assignee}"`;
  }

  jql += " ORDER BY created DESC";

  const maxResults = 100;
  let startAt = 0;
  let allIssues = [];

  try {
    while (true) {
      const response = await fetch(
        `https://gmeremit-team.atlassian.net/rest/api/3/search/jql`,
        {
          method: "POST",
          headers: {
            Authorization: `Basic ${auth}`,
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            jql,
            startAt,
            maxResults,
            fields: ["summary", "assignee", "status", "created", "updated"], // adjust as needed
          }),
        }
      );

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Jira API request failed: ${text}`);
      }

      const data = await response.json();

      if (!data.issues) {
        return res.status(500).json({ error: "Unexpected Jira response", data });
      }

      allIssues.push(...data.issues);

      if (data.startAt + data.maxResults >= data.total) {
        break; // Done fetching all pages
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
