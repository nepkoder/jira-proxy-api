export default async function handler(req, res) {
  // CORS Headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const { operation = false } = req.query;

  const email = process.env.JIRA_EMAIL;
  const token = process.env.JIRA_TOKEN;
  const auth = Buffer.from(`${email}:${token}`).toString("base64");

  // Define projects
  const projects = operation ? ["OT", "OPST"] : ["GBP"];

  try {
    let allAssignees = [];

    // Fetch from each project
    for (const project of projects) {
      const url = `https://gmeremit-team.atlassian.net/rest/api/3/user/assignable/search?project=${project}`;

      const response = await fetch(url, {
        headers: {
          Authorization: `Basic ${auth}`,
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch for project ${project}: ${response.statusText}`);
      }

      const users = await response.json();

      // Push unique users only
      allAssignees.push(
        ...users.map(user => ({
          accountId: user.accountId,
          name: user.displayName,
          email: user.emailAddress,
        }))
      );
    }

    // Remove duplicates by accountId
    const uniqueAssigneesMap = new Map();
    allAssignees.forEach(user => uniqueAssigneesMap.set(user.accountId, user));

    const uniqueSortedAssignees = Array.from(uniqueAssigneesMap.values()).sort((a, b) =>
      a.name.localeCompare(b.name)
    );

    res.status(200).json({ assignees: uniqueSortedAssignees });

  } catch (err) {
    res.status(500).json({
      error: "Failed to fetch assignees",
      message: err.message,
    });
  }
}
