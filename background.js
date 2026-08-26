const LEETCODE_API = 'https://leetcode.com/graphql';
const LEETCODE_USERNAME = 'LeadingTheAbyss';
const GITHUB_USERNAME = 'LeadingTheAbyss';
const CODEFORCES_HANDLE = 'Masochistic';

const DAILY_QUERY = `
  query questionOfToday { activeDailyCodingChallengeQuestion { question { titleSlug } } }
`;

const SUBMISSIONS_QUERY = `
  query recentAcSubmissions($username: String!) {
    recentAcSubmissionList(username: $username, limit: 15) { titleSlug timestamp }
  }
`;

// IST is UTC+5:30. Returns the unix timestamp (seconds) of the most recent
// midnight IST, i.e. the start of "today" in IST.
function getMidnightISTTimestamp() {
  const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
  const nowMs = Date.now();
  const istNowMs = nowMs + IST_OFFSET_MS;
  const istMidnightMs = Math.floor(istNowMs / 86400000) * 86400000;
  return Math.floor((istMidnightMs - IST_OFFSET_MS) / 1000);
}

async function checkDailyChallenge() {
  try {
    const dailyRes = await fetch(LEETCODE_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: DAILY_QUERY })
    });
    const dailyData = await dailyRes.json();
    const dailySlug = dailyData.data?.activeDailyCodingChallengeQuestion?.question?.titleSlug;

    if (!dailySlug) return;

    const subRes = await fetch(LEETCODE_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: SUBMISSIONS_QUERY, variables: { username: LEETCODE_USERNAME } })
    });
    const subData = await subRes.json();
    const submissions = subData.data?.recentAcSubmissionList;

    if (!submissions) return;

    const midnightIST = getMidnightISTTimestamp();
    const hasDoneDaily = submissions.some(sub =>
      sub.titleSlug === dailySlug && Number(sub.timestamp) > midnightIST
    );

    chrome.storage.local.set({ isDailyDone: hasDoneDaily });

  } catch (error) {
    console.error("LeetCode fetch failed. Wi-Fi might be waking up.", error);
    chrome.alarms.create('retryLeetCode', { delayInMinutes: 1 });
  }
}

const GITHUB_CONTRIBUTIONS_QUERY = `
  query($username: String!, $from: DateTime!, $to: DateTime!) {
    user(login: $username) {
      contributionsCollection(from: $from, to: $to) {
        contributionCalendar {
          weeks { contributionDays { date contributionCount } }
        }
      }
    }
  }
`;

// GitHub's contributionCalendar buckets days by the profile's timezone
// setting, defaulting to UTC when none is set (as is the case here).
// Returns today's date as YYYY-MM-DD in UTC, matching contributionDays[].date.
function getTodayUTCDateString() {
  return new Date().toISOString().slice(0, 10);
}

async function checkGithub() {
  try {
    const { githubToken } = await chrome.storage.local.get(['githubToken']);
    if (!githubToken) {
      console.warn("No GitHub token configured; skipping GitHub check.");
      return;
    }

    const now = new Date();
    const fromIso = new Date(now.getTime() - 2 * 86400000).toISOString();
    const toIso = now.toISOString();
    const todayUTC = getTodayUTCDateString();

    const res = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${githubToken}`
      },
      body: JSON.stringify({
        query: GITHUB_CONTRIBUTIONS_QUERY,
        variables: { username: GITHUB_USERNAME, from: fromIso, to: toIso }
      })
    });
    const data = await res.json();
    const weeks = data.data?.user?.contributionsCollection?.contributionCalendar?.weeks;

    if (!Array.isArray(weeks)) {
      console.error("GitHub GraphQL response missing contribution data.", data);
      return;
    }

    const todayEntry = weeks
      .flatMap(w => w.contributionDays)
      .find(d => d.date === todayUTC);

    chrome.storage.local.set({ isGithubDone: !!todayEntry && todayEntry.contributionCount > 0 });

  } catch (error) {
    console.error("GitHub fetch failed.", error);
    chrome.alarms.create('retryGithub', { delayInMinutes: 1 });
  }
}

async function checkCodeforces() {
  try {
    const res = await fetch(`https://codeforces.com/api/user.status?handle=${CODEFORCES_HANDLE}&from=1&count=20`);
    const data = await res.json();

    if (data.status !== 'OK') return;

    const midnightIST = getMidnightISTTimestamp();
    const hasSubmissionToday = data.result.some(sub =>
      Number(sub.creationTimeSeconds) > midnightIST
    );

    chrome.storage.local.set({ isCodeforcesDone: hasSubmissionToday });

  } catch (error) {
    console.error("Codeforces fetch failed.", error);
    chrome.alarms.create('retryCodeforces', { delayInMinutes: 1 });
  }
}

function checkAll() {
  // Respect an active snooze - skip re-flagging things as not-done until it expires
  chrome.storage.local.get(['snoozeUntil'], (result) => {
    if (result.snoozeUntil && Date.now() < result.snoozeUntil) return;
    checkDailyChallenge();
    checkGithub();
    checkCodeforces();
  });
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create('checkAll', { periodInMinutes: 5 });
  checkAll();
});

chrome.runtime.onStartup.addListener(() => {
  checkAll();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'checkAll') {
    checkAll();
  } else if (alarm.name === 'retryLeetCode') {
    checkDailyChallenge();
  } else if (alarm.name === 'retryGithub') {
    checkGithub();
  } else if (alarm.name === 'retryCodeforces') {
    checkCodeforces();
  } else if (alarm.name === 'snoozeExpired') {
    chrome.storage.local.set({ snoozeUntil: null });
    checkAll();
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'forceCheck') {
    chrome.storage.local.set({ snoozeUntil: null });
    checkAll();
  } else if (request.action === 'snooze') {
    const hours = request.hours;
    const until = Date.now() + hours * 60 * 60 * 1000;
    chrome.storage.local.set({ snoozeUntil: until });
    chrome.alarms.create('snoozeExpired', { delayInMinutes: hours * 60 });
  }
});

checkAll();
