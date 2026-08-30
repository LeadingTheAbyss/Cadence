const FIELDS = ['leetcodeUsername', 'codeforcesHandle', 'githubUsername'];

function renderGithubError(githubError) {
  const box = document.getElementById('github-error');
  if (githubError) {
    box.textContent = `Last GitHub check error: ${githubError}`;
    box.hidden = false;
  } else {
    box.hidden = true;
  }
}

chrome.storage.local.get([...FIELDS, 'githubToken', 'githubError'], (result) => {
  FIELDS.forEach((field) => {
    if (result[field]) document.getElementById(field).value = result[field];
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

document.getElementById('save').addEventListener('click', () => {
  const status = document.getElementById('status');
  const values = {};

  FIELDS.forEach((field) => {
    values[field] = document.getElementById(field).value.trim();
  });

  const token = document.getElementById('githubToken').value.trim();
  if (token) values.githubToken = token;

  chrome.storage.local.set(values, () => {
    status.textContent = 'Saved.';
    status.style.color = '#8aff8a';
    document.getElementById('githubToken').value = '';
    chrome.runtime.sendMessage({ action: 'forceCheck' });
  });
});
