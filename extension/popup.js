'use strict';

const DEFAULTS = {
  enabled: true,
  type: 'deuteranopia',
  severity: 1.0,
  strength: 0.8,
  disabledHosts: [],
};

const $ = (id) => document.getElementById(id);
let settings = { ...DEFAULTS };
let currentHost = null;

function save() {
  chrome.storage.sync.set(settings);
}

function render() {
  $('enabled').checked = settings.enabled;
  $('switch-state').textContent = settings.enabled ? 'On' : 'Off';
  document.querySelectorAll('#types button').forEach((b) => {
    b.classList.toggle('active', b.dataset.type === settings.type);
  });
  $('severity').value = settings.severity;
  $('severity-value').textContent = Math.round(settings.severity * 100) + '%';
  $('strength').value = settings.strength;
  $('strength-value').textContent = Math.round(settings.strength * 100) + '%';
  if (currentHost) {
    $('host-label').textContent = 'Disable on ' + currentHost;
    $('host-disabled').checked = (settings.disabledHosts || []).includes(currentHost);
  }
}

$('enabled').addEventListener('change', (e) => {
  settings.enabled = e.target.checked;
  save();
  render();
});

document.querySelectorAll('#types button').forEach((b) => {
  b.addEventListener('click', () => {
    settings.type = b.dataset.type;
    save();
    render();
  });
});

$('severity').addEventListener('input', (e) => {
  settings.severity = parseFloat(e.target.value);
  save();
  render();
});

$('strength').addEventListener('input', (e) => {
  settings.strength = parseFloat(e.target.value);
  save();
  render();
});

$('host-disabled').addEventListener('change', (e) => {
  if (!currentHost) return;
  const set = new Set(settings.disabledHosts || []);
  if (e.target.checked) set.add(currentHost);
  else set.delete(currentHost);
  settings.disabledHosts = [...set];
  save();
});

chrome.storage.sync.get(DEFAULTS, (loaded) => {
  settings = { ...DEFAULTS, ...loaded };
  render();
});

chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  try {
    const url = new URL(tabs[0].url);
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      currentHost = url.hostname;
    }
  } catch { /* chrome:// pages etc. */ }
  render();
});
