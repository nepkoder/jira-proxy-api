export default async function handler(req, res) {
  // CORS Headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  const { project = "GBP" } = req.query;

  const email = process.env.JIRA_EMAIL;
  const token = process.env.JIRA_TOKEN;

  if (!email || !token) {
    return res.status(500).json({ error: "Jira credentials not set in environment variables" });
  }

  const auth = Buffer.from(`${email}:${token}`).toString("base64");

  // Determine projects
  const projects = project !== "GBP" ? ["OT"] : ["GBP"];

  try {
    let allAssignees = [];

    const fetchAssignedUsers = async (projectKey) => {
      const maxResults = 100;
      let startAt = 0;
      let assignees = [];

      while (true) {
        const requestBody = {
          jql: `project = "${projectKey}" AND assignee IS NOT EMPTY ORDER BY assignee ASC`,
          startAt,
          maxResults,
          fields: ["assignee"],
        };

        const response = await fetch(
          "https://gmeremit-team.atlassian.net/rest/api/3/search/jql",
          {
            method: "POST",
            headers: {
              Authorization: `Basic ${auth}`,
              Accept: "application/json",
              "Content-Type": "application/json",
            },
            body: JSON.stringify(requestBody),
          }
        );

        if (!response.ok) {
          const text = await response.text();
          throw new Error(`Failed to fetch issues for project ${projectKey}: ${text}`);
        }

        const data = await response.json();

        const users = data.issues
          .map(issue => issue.fields.assignee)
          .filter(Boolean)
          .map(user => ({
            accountId: user.accountId,
            name: user.displayName,
            email: user.emailAddress || "",
          }));

        assignees.push(...users);

        // Pagination
        if (data.startAt + data.maxResults >= data.total) break;
        startAt += maxResults;
      }

      return assignees;
    };

    // Fetch assignees for all projects
    for (const projectKey of projects) {
      const assignees = await fetchAssignedUsers(projectKey);
      allAssignees.push(...assignees);
    }

    // Deduplicate and sort
    const uniqueAssigneesMap = new Map();
    allAssignees.forEach(user => uniqueAssigneesMap.set(user.accountId, user));

    const uniqueSortedAssignees = Array.from(uniqueAssigneesMap.values()).sort((a, b) =>
      a.name.localeCompare(b.name)
    );

    res.status(200).json({ assignees: uniqueSortedAssignees });

  } catch (err) {
    res.status(500).json({
      error: "Failed to fetch assigned users",
      message: err.message,
    });
  }
}
