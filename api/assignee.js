export default async function handler(req, res) {
  // CORS Headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const { project = "GBP" } = req.query;

  const email = process.env.JIRA_EMAIL;
  const token = process.env.JIRA_TOKEN;
  const auth = Buffer.from(`${email}:${token}`).toString("base64");

  try {
    const url = `https://gmeremit-team.atlassian.net/rest/api/3/user/assignable/search?project=${project}`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: "application/json",
      },
    });

    const users = await response.json();

    // Map users to simpler format
    const assignees = users.map(user => ({
      accountId: user.accountId,
      name: user.displayName,
      email: user.emailAddress, // optional
    }));

    res.status(200).json({ assignees });

  } catch (err) {
    res.status(500).json({ error: "Failed to fetch assignees", message: err.message });
  }
}