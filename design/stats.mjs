// Fetches the GitHub figures of the "Mon activité" and "Mes commits" cards into data/github.json. Run: npm run stats
// Needs a token in GITHUB_TOKEN (or GH_TOKEN): the Actions token is enough, it only reads public profile data.
// Private contributions count in the calendar when "Private contributions" is enabled on the profile.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const LOGIN = 'Kaysuto';
const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
if (!token) throw new Error('Set GITHUB_TOKEN or GH_TOKEN');

async function gql(query, variables = {}) {
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { authorization: `bearer ${token}`, 'content-type': 'application/json', 'user-agent': 'kaysuto-profile' },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (!res.ok || json.errors) throw new Error(JSON.stringify(json.errors ?? json));
  return json.data;
}

const { user } = await gql(`query($login: String!) { user(login: $login) {
  createdAt
  contributionsCollection {
    contributionYears totalCommitContributions
    contributionCalendar { weeks { contributionDays { contributionCount } } }
  }
  pullRequests { totalCount }
  repositories(ownerAffiliations: OWNER, privacy: PUBLIC, first: 100) { nodes { stargazerCount } }
} }`, { login: LOGIN });

// One calendar per year since the account was created, so the total and the streaks cover every day.
const days = [];
for (const year of [...user.contributionsCollection.contributionYears].sort()) {
  const { user: u } = await gql(`query($login: String!, $from: DateTime!, $to: DateTime!) { user(login: $login) {
    contributionsCollection(from: $from, to: $to) { contributionCalendar { weeks { contributionDays { date contributionCount } } } }
  } }`, { login: LOGIN, from: `${year}-01-01T00:00:00Z`, to: `${year}-12-31T23:59:59Z` });
  for (const w of u.contributionsCollection.contributionCalendar.weeks) days.push(...w.contributionDays);
}
const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' }); // YYYY-MM-DD
const past = days.filter(d => d.date <= today).sort((a, b) => a.date.localeCompare(b.date));

// Longest run of active days; the current run may still end yesterday (today is not over yet).
let longest = 0, run = 0;
for (const d of past) { run = d.contributionCount ? run + 1 : 0; longest = Math.max(longest, run); }
let current = 0, i = past.length - 1;
if (i >= 0 && !past[i].contributionCount) i--;
for (; i >= 0 && past[i].contributionCount; i--) current++;

const data = {
  updated: today,
  total: past.reduce((n, d) => n + d.contributionCount, 0),
  since: user.createdAt.slice(0, 4),
  current,
  longest,
  commitsThisYear: user.contributionsCollection.totalCommitContributions,
  pullRequests: user.pullRequests.totalCount,
  stars: user.repositories.nodes.reduce((n, r) => n + r.stargazerCount, 0),
  // The profile calendar for the heatmap: the last year, Sunday-first weeks, oldest first.
  weeks: user.contributionsCollection.contributionCalendar.weeks.map(w => w.contributionDays.map(d => d.contributionCount)),
};
// Commits authored per project, for the "Mes commits" card. Most repositories are private, so this needs a
// personal token in COMMITS_TOKEN; a repository the token cannot read keeps its last known count.
const PROJECTS = {
  'Jelly': ['Kaysuto/playjelly'],
  'Mirum Orbis': ['Kaysuto/mirum-orbis'],
  'Clover Games': ['theclovergames/clovergames', 'theclovergames/clover-launcher', 'theclovergames/clover-bot', 'theclovergames/wiki', 'theclovergames/guide'],
  'Guides & outils': ['Kaysuto/Kaysuto', 'Kaysuto/no-hello', 'Kaysuto/pelican-installation-fr', 'Kaysuto/pterodactyl-installation-fr', 'Kaysuto/rdp-windows11', 'Kaysuto/rename-mkv-track', 'Kaysuto/snake-profile', 'Kaysuto/spotify-discord-status'],
  'Portfolio': ['Kaysuto/portfolio'],
};
const previous = (() => { try { return JSON.parse(readFileSync(new URL('./data/github.json', import.meta.url), 'utf8')).repoCommits ?? {}; } catch { return {}; } })();
const repoToken = process.env.COMMITS_TOKEN || token;
async function countCommits(repo) {
  const res = await fetch(`https://api.github.com/repos/${repo}/commits?author=${LOGIN}&per_page=1`, {
    headers: { authorization: `bearer ${repoToken}`, accept: 'application/vnd.github+json', 'user-agent': 'kaysuto-profile' },
  });
  if (!res.ok) return previous[repo] ?? 0;
  const last = res.headers.get('link')?.match(/[?&]page=(\d+)>; rel="last"/);
  return last ? Number(last[1]) : (await res.json()).length;
}
const repoCommits = {};
for (const repo of Object.values(PROJECTS).flat()) repoCommits[repo] = await countCommits(repo);
data.repoCommits = repoCommits;
data.commits = Object.fromEntries(Object.entries(PROJECTS).map(([name, repos]) => [name, repos.reduce((n, r) => n + repoCommits[r], 0)]));

mkdirSync(new URL('./data/', import.meta.url), { recursive: true });
writeFileSync(new URL('./data/github.json', import.meta.url), `${JSON.stringify(data, null, 2)}\n`);
console.log(`total ${data.total} · current ${data.current} · longest ${data.longest} · updated ${data.updated}`);
