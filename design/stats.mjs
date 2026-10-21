// Fetches the GitHub activity shown on the "Mon activité" card into data/github.json. Run: npm run stats
// Needs a token in GITHUB_TOKEN (or GH_TOKEN): the Actions token is enough, it only reads public profile data.
// Private contributions count in the calendar when "Private contributions" is enabled on the profile.
import { mkdirSync, writeFileSync } from 'node:fs';

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
mkdirSync(new URL('./data/', import.meta.url), { recursive: true });
writeFileSync(new URL('./data/github.json', import.meta.url), `${JSON.stringify(data, null, 2)}\n`);
console.log(`total ${data.total} · current ${data.current} · longest ${data.longest} · updated ${data.updated}`);
