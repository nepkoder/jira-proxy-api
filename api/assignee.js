export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle OPTIONS preflight request
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Extract and validate project parameter
  const { project = 'GBP' } = req.query;
  if (!/^[A-Za-z0-9]+$/.test(project)) {
    return res.status(400).json({ error: 'Invalid project key. Use alphanumeric characters only.' });
  }

  // Jira credentials
  const email = process.env.JIRA_EMAIL;
  const token = process.env.JIRA_TOKEN;
  if (!email || !token) {
    return res.status(500).json({ error: 'Jira credentials not set in environment variables' });
  }
  const auth = Buffer.from(`${email}:${token}`).toString('base64');

  // Determine projects to query
  const projects = project !== 'GBP' ? ['OT'] : ['GBP'];

  // Helper function to fetch assignees with optimized pagination
  async function fetchAssignees(projectKey, retries = 3, delay = 1000) {
    const maxResults = 1000; // Test higher maxResults (adjust if server rejects)
    let startAt = 0;
    const assignees = new Map(); // Deduplicate early

    try {
      while (true) {
        const response = await fetch('https://gmeremit-team.atlassian.net/rest/api/3/search', {
          method: 'POST',
          headers: {
            Authorization: `Basic ${auth}`,
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            jql: `project = "${projectKey}" AND assignee IS NOT EMPTY ORDER BY assignee ASC`,
            startAt,
            maxResults,
            fields: ['assignee'],
            fieldsByKeys: true,
          }),
        });

        if (!response.ok) {
          const text = await response.text();
          if (response.status === 429 && retries > 0) {
            console.warn(`Rate limit hit for ${projectKey}. Retrying after ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            return fetchAssignees(projectKey, retries - 1, delay * 2);
          }
          throw new Error(`Failed to fetch issues for project ${projectKey}: ${response.status} - ${text}`);
        }

        const data = await response.json();
        console.log(`Fetched ${data.issues.length} issues for ${projectKey} at startAt=${startAt}`);

        data.issues
          .map(issue => issue.fields.assignee)
          .filter(Boolean)
          .forEach(user => {
            assignees.set(user.accountId, {
              accountId: user.accountId,
              name: user.displayName,
              email: user.emailAddress || '',
            });
          });

        if (data.startAt + data.issues.length >= data.total) {
          console.log(`Completed fetching for ${projectKey}. Total issues: ${data.total}`);
          break;
        }
        startAt += maxResults;
      }

      return Array.from(assignees.values());
    } catch (err) {
      throw new Error(`Error fetching assignees for ${projectKey}: ${err.message}`);
    }
  }

  try {
    // Fetch assignees for all projects concurrently
    const assigneePromises = projects.map(projectKey => fetchAssignees(projectKey));
    const assigneesArrays = await Promise.all(assigneePromises.catch(err => {
      throw new Error(`Failed to fetch assignees: ${err.message}`);
    }));

    // Combine and deduplicate assignees
    const uniqueAssigneesMap = new Map();
    assigneesArrays.flat().forEach(user => uniqueAssigneesMap.set(user.accountId, user));

    // Sort by name
    const uniqueSortedAssignees = Array.from(uniqueAssigneesMap.values()).sort((a, b) =>
      a.name.localeCompare(b.name)
    );

    // Return response
    res.status(200).json({ assignees: uniqueSortedAssignees });
  } catch (err) {
    console.error('Error in handler:', err);
    res.status(500).json({
      error: 'Failed to fetch assigned users',
      message: err.message,
    });
  }
}