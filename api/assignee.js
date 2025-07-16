export default async function handler(req, res) {
  // CORS Headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const { project = 'GBP' } = req.query;

  const email = process.env.JIRA_EMAIL;
  const token = process.env.JIRA_TOKEN;
  const auth = Buffer.from(`${email}:${token}`).toString("base64");

  // Define projects
  const projects = project !== 'GBP' ? ["OT"] : ["GBP"];

  try {
    let allAssignees = [];

    // Helper: Fetch assigned users in a project
    const fetchAssignedUsers = async (projectKey) => {
      const jql = `project = ${projectKey} AND assignee IS NOT EMPTY`;
      const url = `https://gmeremit-team.atlassian.net/rest/api/3/search?jql=${encodeURIComponent(jql)}&fields=assignee&maxResults=1000`;

      const response = await fetch(url, {
        headers: {
          Authorization: `Basic ${auth}`,
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch issues for project ${projectKey}: ${response.statusText}`);
      }

      const data = await response.json();

      const assignees = data.issues
        .map(issue => issue.fields.assignee)
        .filter(Boolean)
        .map(user => ({
          accountId: user.accountId,
          name: user.displayName,
          email: user.emailAddress || "",
        }));

      return assignees;
    };

    // Fetch assigned users from each project
    for (const projectKey of projects) {
      const assignees = await fetchAssignedUsers(projectKey);
      allAssignees.push(...assignees);
    }

    // Deduplicate by accountId
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
