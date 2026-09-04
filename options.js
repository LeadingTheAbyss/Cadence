const USERNAME_FIELDS = ['leetcodeUsername', 'githubUsername', 'codeforcesHandle'];
const DEFAULT_USERNAMES = {
  leetcodeUsername: '',
  githubUsername: '',
  codeforcesHandle: ''
};

function renderGithubError(githubError) {
  const box = document.getElementById('github-error');
  if (githubError) {
    box.textContent = `Last GitHub check error: ${githubError}`;
    box.hidden = false;
  } else {
    box.hidden = true;
  }
}

chrome.storage.local.get([...USERNAME_FIELDS, 'githubToken', 'githubError'], (result) => {
  USERNAME_FIELDS.forEach((field) => {
    document.getElementById(field).value = result[field] || DEFAULT_USERNAMES[field];
  });
  if (result.githubToken) {
    document.getElementById('githubToken').placeholder = 'Token already saved (hidden)';
  }
  renderGithubError(result.githubError);
});

chrome.storage.onChanged.addListener((changes) => {
  if (changes.githubError) {
    renderGithubError(changes.githubError.newValue);
  }
});

document.getElementById('save-usernames').addEventListener('click', () => {
  const status = document.getElementById('username-status');
  const values = {};

  for (const field of USERNAME_FIELDS) {
    const value = document.getElementById(field).value.trim();
    if (!value) {
      status.textContent = 'All three fields are required.';
      status.style.color = '#ff8080';
      return;
    }
    values[field] = value;
  }

  chrome.storage.local.set(values, () => {
    status.textContent = 'Usernames saved.';
    status.style.color = '#8aff8a';
    chrome.runtime.sendMessage({ action: 'forceCheck' });
  });
});

document.getElementById('save').addEventListener('click', () => {
  const status = document.getElementById('status');
  const token = document.getElementById('githubToken').value.trim();

  if (!token) {
    status.textContent = 'Please enter a token.';
    status.style.color = '#ff8080';
    return;
  }

  chrome.storage.local.set({ githubToken: token }, () => {
    status.textContent = 'Token saved.';
    status.style.color = '#8aff8a';
    document.getElementById('githubToken').value = '';
    chrome.runtime.sendMessage({ action: 'forceCheck' });
  });
});
