export default async function handler(req, res) {
  const email = process.env.JIRA_EMAIL;
  const token = process.env.JIRA_TOKEN;
  const auth = Buffer.from(`${email}:${token}`).toString("base64");

  try {
    const response = await fetch(
      "https://gmeremit-team.atlassian.net/rest/api/3/search?jql=project=GMEBiz%20ORDER%20BY%20key%20DESC&maxResults=100",
      {
        headers: {
          Authorization: `Basic ${auth}`,
          Accept: "application/json",
        },
      }
    );

    const data = await response.json();
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: "Jira API error", message: err.message });
  }
}
