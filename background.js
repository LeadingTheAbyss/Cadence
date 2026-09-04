const LEETCODE_API = 'https://leetcode.com/graphql';

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

// LeetCode's daily challenge doesn't actually roll over at midnight IST,
// it rolls over at 5:30 AM IST. Returns the unix timestamp (seconds) of the
// most recent 5:30 AM IST.
function getLeetCodeResetTimestamp() {
  const RESET_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  const midnightIST = getMidnightISTTimestamp();
  const todayResetTimestamp = midnightIST + RESET_OFFSET_MS / 1000;
  if (Date.now() / 1000 < todayResetTimestamp) {
    return todayResetTimestamp - 86400;
  }
  return todayResetTimestamp;
}

const DEFAULT_USERNAMES = {
  leetcodeUsername: '',
  githubUsername: '',
  codeforcesHandle: ''
};

async function getUsernames() {
  const stored = await chrome.storage.local.get(Object.keys(DEFAULT_USERNAMES));
  return {
    leetcodeUsername: stored.leetcodeUsername || DEFAULT_USERNAMES.leetcodeUsername,
    githubUsername: stored.githubUsername || DEFAULT_USERNAMES.githubUsername,
    codeforcesHandle: stored.codeforcesHandle || DEFAULT_USERNAMES.codeforcesHandle
  };
}

async function checkDailyChallenge() {
  try {
    const { leetcodeUsername } = await getUsernames();
    if (!leetcodeUsername) {
      console.warn("No LeetCode username configured; skipping LeetCode check.");
      return;
    }

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
      body: JSON.stringify({ query: SUBMISSIONS_QUERY, variables: { username: leetcodeUsername } })
    });
    const subData = await subRes.json();
    const submissions = subData.data?.recentAcSubmissionList;

    if (!submissions) return;

    const leetCodeReset = getLeetCodeResetTimestamp();
    const hasDoneDaily = submissions.some(sub =>
      sub.titleSlug === dailySlug && Number(sub.timestamp) > leetCodeReset
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
        commitContributionsByRepository(maxRepositories: 20) {
          contributions(first: 50) {
            nodes { occurredAt commitCount }
          }
        }
      }
    }
  }
`;

async function checkGithub() {
  try {
    const { githubToken } = await chrome.storage.local.get(['githubToken']);
    const { githubUsername } = await getUsernames();
    if (!githubToken || !githubUsername) {
      chrome.storage.local.set({ githubError: 'No token saved. Open extension options and save a PAT.' });
      return;
    }

    const now = new Date();
    const fromIso = new Date(now.getTime() - 2 * 86400000).toISOString();
    const toIso = now.toISOString();

    const res = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${githubToken}`
      },
      body: JSON.stringify({
        query: GITHUB_CONTRIBUTIONS_QUERY,
        variables: { username: githubUsername, from: fromIso, to: toIso }
      })
    });
    const data = await res.json();

    if (data.errors) {
      chrome.storage.local.set({ githubError: data.errors.map(e => e.message).join('; ') });
      return;
    }

    const byRepo = data.data?.user?.contributionsCollection?.commitContributionsByRepository;

    if (!Array.isArray(byRepo)) {
      chrome.storage.local.set({ githubError: 'Unexpected GitHub GraphQL response shape.' });
      return;
    }

    const midnightIST = getMidnightISTTimestamp();
    const hasCommitSinceMidnightIST = byRepo.some(repo =>
      repo.contributions.nodes.some(n =>
        n.commitCount > 0 && (new Date(n.occurredAt).getTime() / 1000) > midnightIST
      )
    );

    chrome.storage.local.set({ isGithubDone: hasCommitSinceMidnightIST, githubError: null });

  } catch (error) {
    console.error("GitHub fetch failed.", error);
    chrome.alarms.create('retryGithub', { delayInMinutes: 1 });
  }
}

async function checkCodeforces() {
  try {
    const { codeforcesHandle } = await getUsernames();
    if (!codeforcesHandle) {
      console.warn("No Codeforces handle configured; skipping Codeforces check.");
      return;
    }

    const res = await fetch(`https://codeforces.com/api/user.status?handle=${encodeURIComponent(codeforcesHandle)}&from=1&count=20`);
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

async function checkAll() {
  // Respect an active snooze - skip re-flagging things as not-done until it expires
  const { snoozeUntil } = await chrome.storage.local.get(['snoozeUntil']);
  if (snoozeUntil && Date.now() < snoozeUntil) return;
  await Promise.all([checkDailyChallenge(), checkGithub(), checkCodeforces()]);
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
    chrome.storage.local.set({ snoozeUntil: null }, () => {
      checkAll().finally(() => sendResponse({ done: true }));
    });
    return true; // keeps the message channel open for async sendResponse
  } else if (request.action === 'snooze') {
    const hours = request.hours;
    const until = Date.now() + hours * 60 * 60 * 1000;
    chrome.storage.local.set({ snoozeUntil: until });
    chrome.alarms.create('snoozeExpired', { delayInMinutes: hours * 60 });
  } else if (request.action === 'openOptions') {
    chrome.runtime.openOptionsPage();
  }
});

checkAll();
