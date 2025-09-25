export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle OPTIONS preflight request
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Extract and validate query parameters
  const { filter = 'full', from, to, mode, assignee = 'All' } = req.query;

  // Validate filter
  const validFilters = ['full', 'weekly', 'monthly', 'custom'];
  if (!validFilters.includes(filter)) {
    return res.status(400).json({ error: 'Invalid filter. Use: full, weekly, monthly, or custom.' });
  }

  // Validate mode
  const validModes = ['operation', 'GAT', 'GBP'];
  const projectKey = mode && validModes.includes(mode) ? (mode === 'operation' ? 'OT' : mode) : 'GBP';
  
  // Validate assignee
  if (assignee !== 'All' && !/^[A-Za-z0-9_-]+$/.test(assignee)) {
    return res.status(400).json({ error: 'Invalid assignee. Use alphanumeric, underscore, or hyphen.' });
  }

  // Validate dates for custom filter
  if (filter === 'custom') {
    if (!from || !to) {
      return res.status(400).json({ error: 'Custom filter requires from and to dates.' });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD.' });
    }
  }

  // Jira credentials
  const email = process.env.JIRA_EMAIL;
  const token = process.env.JIRA_TOKEN;
  if (!email || !token) {
    return res.status(500).json({ error: 'Jira credentials not set in environment variables' });
  }
  const auth = Buffer.from(`${email}:${token}`).toString('base64');

  // Helper: Format date as YYYY-MM-DD
  const formatDate = (date) => {
    const d = new Date(date);
    if (isNaN(d.getTime())) {
      throw new Error('Invalid date provided');
    }
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  // Build JQL
  let jql = `project = "${projectKey}"`;
  const today = new Date();
  const todayFormatted = formatDate(today);

  try {
    if (filter === 'weekly') {
      const day = today.getDay();
      const lastSunday = new Date(today);
      lastSunday.setDate(today.getDate() - day - 7);
      jql += ` AND "Start date[Date]" >= "${formatDate(lastSunday)}" AND "Start date[Date]" <= "${todayFormatted}"`;
    } else if (filter === 'monthly') {
      const lastMonthFirstDay = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      jql += ` AND "Start date[Date]" >= "${formatDate(lastMonthFirstDay)}" AND "Start date[Date]" <= "${todayFormatted}"`;
    } else if (filter === 'custom') {
      jql += ` AND "Start date[Date]" >= "${formatDate(from)}" AND "Start date[Date]" <= "${formatDate(to)}"`;
    }

    if (assignee !== 'All') {
      jql += ` AND assignee = "${assignee}"`;
    }

    jql += ' ORDER BY created DESC';

    // Fetch issues with pagination and retry logic
    const maxResults = 1000; // Test higher value; reduce to 100 if rejected
    let startAt = 0;
    let allIssues = [];

    while (true) {
      const response = await fetch('https://gmeremit-team.atlassian.net/rest/api/3/search', {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jql,
          startAt,
          maxResults,
          fields: ['summary', 'assignee', 'status', 'created', 'updated'],
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        if (response.status === 429) {
          console.warn(`Rate limit hit. Retrying after 1000ms...`);
          await new Promise(resolve => setTimeout(resolve, 1000));
          continue; // Retry same request
        }
        throw new Error(`Failed to fetch issues for ${projectKey}: ${response.status} - ${text}`);
      }

      const data = await response.json();
      if (!data.issues) {
        throw new Error('Unexpected Jira response: No issues field');
      }

      console.log(`Fetched ${data.issues.length} issues at startAt=${startAt}`);
      allIssues.push(...data.issues);

      if (data.startAt + data.issues.length >= data.total) {
        console.log(`Completed fetching. Total issues: ${data.total}`);
        break;
      }
      startAt += maxResults;
    }

    res.status(200).json({
      total: allIssues.length,
      issues: allIssues,
    });
  } catch (err) {
    console.error('Error in handler:', err);
    res.status(500).json({
      error: 'Failed to fetch issues',
      message: err.message,
    });
  }
}