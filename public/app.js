/* ============================================================
   TaskFlow — app.js (Express Backend Edition)
   All data operations go through the REST API.
   Notifications are handled client-side.
   ============================================================ */

'use strict';

// ─── API Base ─────────────────────────────────────────────────
const API = {
  scheduled: '/api/scheduled',
  todos:     '/api/todos',
};

// ─── State ───────────────────────────────────────────────────
const STATE = {
  scheduledTasks:       [],
  todoTasks:            [],
  notificationsEnabled: true,
  currentAlertTaskId:   null,
  alertIntervalId:      null,
  todoView:             'all',
};

const CAT_EMOJI  = { work: '💼', health: '💪', personal: '🏠', study: '📚', other: '✨' };
const CAT_COLOR  = { work: '#7c5af0', health: '#34d399', personal: '#22d3ee', study: '#fbbf24', other: '#f43f5e' };
const PRI_EMOJI  = { high: '🔴', medium: '🟡', low: '🟢' };
const MORNING_HOUR = 8;
const EVENING_HOUR = 18;
const ALERT_INTERVAL_MS = 5 * 60 * 1000;   // 5 minutes

// ─── Modal context ────────────────────────────────────────────
let _modalType   = 'schedule';
let _selectedCat = 'work';
let _selectedPri = 'medium';

// ─── Boot ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  // Load notification preference from localStorage (UI-only setting)
  const savedNotif = localStorage.getItem('tf_notif_enabled');
  if (savedNotif !== null) {
    STATE.notificationsEnabled = JSON.parse(savedNotif);
    document.getElementById('notif-toggle').checked = STATE.notificationsEnabled;
  }

  startClock();
  await loadAllTasks();
  startSchedulePoller();
  startTodoBroadcaster();
  checkNotifPermission();
});

// ─── API Helpers ──────────────────────────────────────────────
async function apiFetch(url, options = {}) {
  try {
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json', ...options.headers },
      ...options,
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
    return json;
  } catch (err) {
    console.error('[TaskFlow API]', err.message);
    showToast('❌', 'API Error', err.message, 'error');
    throw err;
  }
}

// ─── Load All Data ────────────────────────────────────────────
async function loadAllTasks() {
  try {
    const [schedRes, todoRes] = await Promise.all([
      apiFetch(API.scheduled),
      apiFetch(API.todos),
    ]);
    STATE.scheduledTasks = schedRes.data;
    STATE.todoTasks       = todoRes.data;
    renderTimeline();
    renderTodoList();
    renderOverview();
  } catch {
    showToast('❌', 'Failed to Load', 'Could not connect to server.', 'error');
  }
}

// ─── Clock ───────────────────────────────────────────────────
function startClock() {
  function tick() {
    const now = new Date();
    document.getElementById('live-clock').textContent =
      now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    document.getElementById('live-date').textContent =
      now.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  }
  tick();
  setInterval(tick, 1000);
}

// ─── View Switching ───────────────────────────────────────────
function switchView(viewName) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(`view-${viewName}`).classList.add('active');
  document.getElementById(`nav-${viewName}`).classList.add('active');
  if (viewName === 'overview') renderOverview();
}

// ─── Modal ────────────────────────────────────────────────────
function openModal(type) {
  _modalType   = type;
  _selectedCat = 'work';
  _selectedPri = 'medium';

  document.getElementById('task-form').reset();
  document.querySelectorAll('.cat-pill').forEach(p => p.classList.remove('active'));
  document.querySelector('.cat-pill[data-cat="work"]').classList.add('active');
  document.querySelectorAll('.pri-pill').forEach(p => p.classList.remove('active'));
  document.querySelector('.pri-pill[data-pri="medium"]').classList.add('active');

  document.getElementById('modal-title').textContent =
    type === 'schedule' ? 'Add Scheduled Task' : 'Add To-Do Task';

  const schedFields = document.getElementById('schedule-fields');
  schedFields.style.display = type === 'schedule' ? 'block' : 'none';

  document.getElementById('task-start').required = type === 'schedule';
  document.getElementById('task-end').required   = type === 'schedule';

  document.getElementById('modal-overlay').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
}

function closeModalOutside(e) {
  if (e.target === document.getElementById('modal-overlay')) closeModal();
}

function selectCat(btn) {
  document.querySelectorAll('.cat-pill').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  _selectedCat = btn.dataset.cat;
}

function selectPri(btn) {
  document.querySelectorAll('.pri-pill').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  _selectedPri = btn.dataset.pri;
}

async function saveTask(e) {
  e.preventDefault();
  const saveBtn = document.getElementById('save-btn');
  const name    = document.getElementById('task-name').value.trim();
  const notes   = document.getElementById('task-notes').value.trim();

  if (!name) return;

  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving…';

  try {
    if (_modalType === 'schedule') {
      const start = document.getElementById('task-start').value;
      const end   = document.getElementById('task-end').value;

      const result = await apiFetch(API.scheduled, {
        method: 'POST',
        body: JSON.stringify({ name, cat: _selectedCat, start, end, notes }),
      });

      STATE.scheduledTasks.push(result.data);
      STATE.scheduledTasks.sort((a, b) => a.start.localeCompare(b.start));
      renderTimeline();
      renderOverview();
      showToast('📅', 'Task Scheduled!', `"${name}" added to your timeline.`, 'success');

    } else {
      const result = await apiFetch(API.todos, {
        method: 'POST',
        body: JSON.stringify({ name, cat: _selectedCat, priority: _selectedPri, notes }),
      });

      STATE.todoTasks.push(result.data);
      renderTodoList();
      renderOverview();
      showToast('✅', 'Task Added!', `"${name}" added to your to-do list.`, 'success');
    }

    closeModal();
  } catch {
    // Error already shown by apiFetch
  } finally {
    saveBtn.disabled    = false;
    saveBtn.textContent = 'Save Task';
  }
}

// ─── Timeline Renderer ────────────────────────────────────────
function renderTimeline() {
  const container = document.getElementById('timeline');

  if (STATE.scheduledTasks.length === 0) {
    container.innerHTML = `
      <div class="timeline-empty">
        <div class="timeline-empty-icon">📅</div>
        <p class="timeline-empty-text">No scheduled tasks yet</p>
        <p class="timeline-empty-sub">Add a time-blocked task to get started</p>
      </div>`;
    return;
  }

  const now     = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();

  const slots = {};
  STATE.scheduledTasks.forEach(task => {
    const hour = task.start.split(':')[0].padStart(2, '0');
    if (!slots[hour]) slots[hour] = [];
    slots[hour].push(task);
  });

  const fmt = t => {
    const [hh, mm] = t.split(':').map(Number);
    const ap = hh >= 12 ? 'PM' : 'AM';
    return `${hh % 12 || 12}:${String(mm).padStart(2, '0')} ${ap}`;
  };

  let html = '';
  Object.keys(slots).sort().forEach(hour => {
    const tasks = slots[hour];
    const isActiveHour = tasks.some(t => {
      const [sh, sm] = t.start.split(':').map(Number);
      const [eh, em] = t.end.split(':').map(Number);
      return nowMins >= sh * 60 + sm && nowMins < eh * 60 + em;
    });

    const labelH = parseInt(hour);
    const ampm   = labelH >= 12 ? 'PM' : 'AM';
    const h12    = labelH % 12 || 12;

    html += `
      <div class="time-slot">
        <div class="time-label">${h12}${ampm}</div>
        <div class="time-dot ${isActiveHour ? 'active-now has-task' : tasks.length ? 'has-task' : ''}"></div>
        <div class="time-tasks">`;

    tasks.forEach(task => {
      const [sh, sm] = task.start.split(':').map(Number);
      const [eh, em] = task.end.split(':').map(Number);
      const isActive  = nowMins >= sh * 60 + sm && nowMins < eh * 60 + em;

      html += `
        <div class="sched-card ${task.completed ? 'completed' : ''} ${isActive && !task.completed ? 'active-card' : ''}"
             data-cat="${task.cat}" data-id="${task.id}">
          <div class="sched-checkbox ${task.completed ? 'checked' : ''}"
               onclick="toggleScheduled('${task.id}')">
            ${task.completed ? '✓' : ''}
          </div>
          <div class="sched-info">
            <div class="sched-name">${escHtml(task.name)}</div>
            <div class="sched-time-badge">
              ${isActive && !task.completed ? '<span class="active-now-label"><span class="pulse-dot"></span> NOW</span> · ' : ''}
              ${fmt(task.start)} – ${fmt(task.end)}
            </div>
            ${task.notes ? `<div class="sched-notes">${escHtml(task.notes)}</div>` : ''}
          </div>
          <span class="sched-cat-badge cat-${task.cat}">${CAT_EMOJI[task.cat]} ${task.cat}</span>
          <button class="sched-delete" onclick="deleteScheduled('${task.id}')" title="Delete">🗑</button>
        </div>`;
    });

    html += `</div></div>`;
  });

  container.innerHTML = html;
}

// ─── Todo Renderer ────────────────────────────────────────────
function renderTodoList() {
  const container = document.getElementById('todo-list');
  let tasks = [...STATE.todoTasks];

  if (STATE.todoView === 'pending')   tasks = tasks.filter(t => !t.completed);
  if (STATE.todoView === 'completed') tasks = tasks.filter(t => t.completed);

  if (tasks.length === 0) {
    container.innerHTML = `
      <div class="todo-empty" style="text-align:center;padding:80px 0;color:var(--text-muted)">
        <div style="font-size:64px;margin-bottom:16px">${STATE.todoView === 'completed' ? '🎉' : '✅'}</div>
        <p style="font-size:18px;color:var(--text-secondary);margin-bottom:8px;font-weight:500">
          ${STATE.todoView === 'completed' ? 'No completed tasks yet' :
            STATE.todoView === 'pending'   ? 'All caught up!'        : 'No tasks yet'}
        </p>
        ${STATE.todoView === 'all' ? '<p style="font-size:14px">Add a task to get started</p>' : ''}
      </div>`;
    return;
  }

  const priOrder = { high: 0, medium: 1, low: 2 };
  tasks.sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    return (priOrder[a.priority] || 1) - (priOrder[b.priority] || 1);
  });

  container.innerHTML = tasks.map(task => `
    <div class="todo-card ${task.completed ? 'completed' : ''}" data-pri="${task.priority}" data-id="${task.id}">
      <div class="todo-checkbox ${task.completed ? 'checked' : ''}"
           onclick="toggleTodo('${task.id}')">
        ${task.completed ? '✓' : ''}
      </div>
      <div class="todo-info">
        <div class="todo-name">${escHtml(task.name)}</div>
        <div class="todo-meta">
          ${task.notes ? `<span>${escHtml(task.notes.substring(0, 60))}${task.notes.length > 60 ? '…' : ''}</span>` : ''}
        </div>
      </div>
      <span class="todo-cat-badge cat-${task.cat}">${CAT_EMOJI[task.cat]} ${task.cat}</span>
      <span class="todo-pri-badge pri-${task.priority}">${PRI_EMOJI[task.priority]} ${task.priority}</span>
      <button class="todo-delete" onclick="deleteTodo('${task.id}')" title="Delete">🗑</button>
    </div>
  `).join('');
}

function filterTodos(filter, btn) {
  STATE.todoView = filter;
  document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  renderTodoList();
}

// ─── Toggle & Delete — Scheduled ─────────────────────────────
async function toggleScheduled(id) {
  const task = STATE.scheduledTasks.find(t => t.id === id);
  if (!task) return;

  const newCompleted = !task.completed;
  try {
    const result = await apiFetch(`${API.scheduled}/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ completed: newCompleted }),
    });

    // Update local state
    const idx = STATE.scheduledTasks.findIndex(t => t.id === id);
    STATE.scheduledTasks[idx] = result.data;

    if (newCompleted && STATE.currentAlertTaskId === id) {
      dismissAlert();
      stopAlertInterval();
      _alertFiredForId = null;
      showToast('🎉', 'Task Completed!', `"${result.data.name}" marked as done. Notifications stopped.`, 'success');
    } else if (newCompleted) {
      showToast('🎉', 'Task Completed!', `"${result.data.name}" marked as done.`, 'success');
    }

    renderTimeline();
    renderOverview();
  } catch { /* error shown by apiFetch */ }
}

async function deleteScheduled(id) {
  if (STATE.currentAlertTaskId === id) {
    dismissAlert();
    stopAlertInterval();
    _alertFiredForId = null;
  }
  try {
    await apiFetch(`${API.scheduled}/${id}`, { method: 'DELETE' });
    STATE.scheduledTasks = STATE.scheduledTasks.filter(t => t.id !== id);
    renderTimeline();
    renderOverview();
    showToast('🗑', 'Task Deleted', 'Scheduled task removed.', 'info');
  } catch { /* error shown by apiFetch */ }
}

// ─── Toggle & Delete — Todo ───────────────────────────────────
async function toggleTodo(id) {
  const task = STATE.todoTasks.find(t => t.id === id);
  if (!task) return;

  const newCompleted = !task.completed;
  try {
    const result = await apiFetch(`${API.todos}/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ completed: newCompleted }),
    });

    const idx = STATE.todoTasks.findIndex(t => t.id === id);
    STATE.todoTasks[idx] = result.data;

    renderTodoList();
    renderOverview();
    if (newCompleted) showToast('🎉', 'Task Completed!', `"${result.data.name}" marked as done.`, 'success');
  } catch { /* error shown by apiFetch */ }
}

async function deleteTodo(id) {
  try {
    await apiFetch(`${API.todos}/${id}`, { method: 'DELETE' });
    STATE.todoTasks = STATE.todoTasks.filter(t => t.id !== id);
    renderTodoList();
    renderOverview();
    showToast('🗑', 'Task Deleted', 'To-do task removed.', 'info');
  } catch { /* error shown by apiFetch */ }
}

// ─── Overview ────────────────────────────────────────────────
function renderOverview() {
  const grid = document.getElementById('overview-grid');
  const totalSched = STATE.scheduledTasks.length;
  const doneSched  = STATE.scheduledTasks.filter(t => t.completed).length;
  const totalTodo  = STATE.todoTasks.length;
  const doneTodo   = STATE.todoTasks.filter(t => t.completed).length;
  const totalAll   = totalSched + totalTodo;
  const doneAll    = doneSched + doneTodo;
  const pct        = totalAll ? Math.round((doneAll / totalAll) * 100) : 0;

  const now     = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();
  const fmt = t => {
    const [hh, mm] = t.split(':').map(Number);
    const ap = hh >= 12 ? 'PM' : 'AM';
    return `${hh % 12 || 12}:${String(mm).padStart(2, '0')} ${ap}`;
  };

  const upcoming = STATE.scheduledTasks.filter(t => {
    if (t.completed) return false;
    const [sh, sm] = t.start.split(':').map(Number);
    const startMins = sh * 60 + sm;
    return startMins > nowMins && startMins - nowMins <= 180;
  }).slice(0, 4);

  grid.innerHTML = `
    <div class="stat-card">
      <div class="stat-icon">📅</div>
      <div class="stat-value">${totalSched}</div>
      <div class="stat-label">Scheduled Tasks</div>
    </div>
    <div class="stat-card">
      <div class="stat-icon">✅</div>
      <div class="stat-value">${doneSched}</div>
      <div class="stat-label">Scheduled Done</div>
    </div>
    <div class="stat-card">
      <div class="stat-icon">📋</div>
      <div class="stat-value">${totalTodo}</div>
      <div class="stat-label">To-Do Tasks</div>
    </div>
    <div class="stat-card">
      <div class="stat-icon">🎯</div>
      <div class="stat-value">${pct}%</div>
      <div class="stat-label">Overall Complete</div>
    </div>

    <div class="progress-card" style="grid-column:1/-1">
      <div class="progress-header">
        <span class="progress-title">Today's Progress</span>
        <span class="progress-pct">${pct}%</span>
      </div>
      <div class="progress-bar">
        <div class="progress-fill" style="width:${pct}%"></div>
      </div>
      <p style="font-size:12px;color:var(--text-muted);margin-top:10px">
        ${doneAll} of ${totalAll} tasks completed today
      </p>
    </div>

    ${upcoming.length > 0 ? `
    <div class="upcoming-card" style="grid-column:1/-1">
      <h3 class="upcoming-title">⏰ Upcoming in Next 3 Hours</h3>
      ${upcoming.map(t => {
        const [sh, sm] = t.start.split(':').map(Number);
        const minsAway = sh * 60 + sm - nowMins;
        return `
        <div class="upcoming-item">
          <div class="upcoming-dot" style="background:${CAT_COLOR[t.cat]}"></div>
          <div class="upcoming-info">
            <div class="upcoming-name">${escHtml(t.name)}</div>
            <div class="upcoming-time">${fmt(t.start)} – ${fmt(t.end)}</div>
          </div>
          <span class="upcoming-mins">in ${minsAway}m</span>
        </div>`;
      }).join('')}
    </div>` : ''}
  `;
}

// ─── Notification Permission ──────────────────────────────────
function checkNotifPermission() {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') showPermissionBanner();
}

function showPermissionBanner() {
  const header = document.querySelector('#view-schedule .view-header');
  if (!header || document.getElementById('notif-banner')) return;

  const banner = document.createElement('div');
  banner.id = 'notif-banner';
  banner.className = 'notif-banner';
  banner.innerHTML = `
    <span style="font-size:24px">🔔</span>
    <p class="notif-banner-text">
      <strong>Enable notifications</strong> to get task reminders when it's time to work.
    </p>
    <button class="btn-allow-notif" onclick="requestNotifPermission()">Allow</button>
    <button onclick="document.getElementById('notif-banner').remove()"
      style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:18px;padding:4px;margin-left:4px">✕</button>
  `;
  header.insertAdjacentElement('afterend', banner);
}

async function requestNotifPermission() {
  const perm = await Notification.requestPermission();
  const banner = document.getElementById('notif-banner');
  if (banner) banner.remove();

  if (perm === 'granted') {
    showToast('🔔', 'Notifications Enabled!', 'You\'ll get task reminders on time.', 'success');
  } else {
    showToast('🔕', 'Notifications Blocked', 'Enable them in browser settings.', 'warn');
  }
}

function toggleNotifications(enabled) {
  STATE.notificationsEnabled = enabled;
  localStorage.setItem('tf_notif_enabled', JSON.stringify(enabled));
  showToast(
    enabled ? '🔔' : '🔕',
    enabled ? 'Notifications On' : 'Notifications Off',
    enabled ? 'You\'ll receive task reminders.' : 'All notifications paused.',
    'info'
  );
  if (!enabled && STATE.alertIntervalId) {
    stopAlertInterval();
    dismissAlert();
  }
}

// ─── Scheduled Task Poller ───────────────────────────────────
let _pollerInterval  = null;
let _alertFiredForId = null;

function startSchedulePoller() {
  checkScheduledTasks();
  _pollerInterval = setInterval(checkScheduledTasks, 30 * 1000);
}

function checkScheduledTasks() {
  if (!STATE.notificationsEnabled) return;

  const now     = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();

  const activeTask = STATE.scheduledTasks.find(t => {
    if (t.completed) return false;
    const [sh, sm] = t.start.split(':').map(Number);
    const [eh, em] = t.end.split(':').map(Number);
    return nowMins >= sh * 60 + sm && nowMins < eh * 60 + em;
  });

  if (activeTask) {
    if (_alertFiredForId !== activeTask.id) {
      _alertFiredForId = activeTask.id;
      fireAlert(activeTask);
      stopAlertInterval();
      STATE.alertIntervalId = setInterval(() => {
        const t = STATE.scheduledTasks.find(x => x.id === _alertFiredForId);
        if (!t || t.completed) { stopAlertInterval(); return; }
        fireAlert(t);
      }, ALERT_INTERVAL_MS);
    }
  } else {
    if (_alertFiredForId) {
      const prev = STATE.scheduledTasks.find(t => t.id === _alertFiredForId);
      if (!prev) { stopAlertInterval(); _alertFiredForId = null; dismissAlert(); return; }
      const [eh, em] = prev.end.split(':').map(Number);
      if (nowMins >= eh * 60 + em) {
        stopAlertInterval();
        _alertFiredForId = null;
        dismissAlert();
      }
    }
  }

  renderTimeline();
}

function fireAlert(task) {
  if (!STATE.notificationsEnabled) return;
  STATE.currentAlertTaskId = task.id;

  const fmt = t => {
    const [hh, mm] = t.split(':').map(Number);
    const ap = hh >= 12 ? 'PM' : 'AM';
    return `${hh % 12 || 12}:${String(mm).padStart(2, '0')} ${ap}`;
  };

  document.getElementById('alert-task-name').textContent = task.name;
  document.getElementById('alert-task-time').textContent = `${fmt(task.start)} – ${fmt(task.end)}`;
  document.getElementById('task-alert-modal').classList.remove('hidden');

  sendSystemNotif(
    `⏰ Task Time: ${task.name}`,
    `${fmt(task.start)} – ${fmt(task.end)} | Did you complete this?`
  );
}

function stopAlertInterval() {
  if (STATE.alertIntervalId) {
    clearInterval(STATE.alertIntervalId);
    STATE.alertIntervalId = null;
  }
}

function handleAlertComplete() {
  const id = STATE.currentAlertTaskId;
  if (id) toggleScheduled(id);
  dismissAlert();
  stopAlertInterval();
  _alertFiredForId = null;
  showToast('🎉', 'Great Work!', 'Task marked complete. Notifications stopped.', 'success');
}

function handleAlertSnooze() {
  dismissAlert();
  showToast('⏭', 'Snoozed', 'You\'ll be reminded again in 5 minutes.', 'info');
}

function dismissAlert() {
  document.getElementById('task-alert-modal').classList.add('hidden');
  STATE.currentAlertTaskId = null;
}

// ─── Todo Daily Broadcaster ──────────────────────────────────
let _lastMorningBroadcast = '';
let _lastEveningBroadcast = '';

function startTodoBroadcaster() {
  checkTodoBroadcast();
  setInterval(checkTodoBroadcast, 60 * 1000);
}

function checkTodoBroadcast() {
  if (!STATE.notificationsEnabled) return;

  const now       = new Date();
  const h         = now.getHours();
  const m         = now.getMinutes();
  const todayKey  = now.toDateString();
  const pending   = STATE.todoTasks.filter(t => !t.completed);

  if (pending.length === 0) return;

  if (h === MORNING_HOUR && m === 0 && _lastMorningBroadcast !== todayKey) {
    _lastMorningBroadcast = todayKey;
    sendSystemNotif('🌅 Good Morning! Your Tasks Await',
      `You have ${pending.length} pending task${pending.length > 1 ? 's' : ''} today. Let's crush it!`);
    showToast('🌅', 'Good Morning!', `${pending.length} tasks pending today.`, 'info');
  }

  if (h === EVENING_HOUR && m === 0 && _lastEveningBroadcast !== todayKey) {
    _lastEveningBroadcast = todayKey;
    const done = STATE.todoTasks.filter(t => t.completed).length;
    sendSystemNotif('🌆 Evening Check-In',
      `You completed ${done} tasks today. ${pending.length} still pending.`);
    showToast('🌆', 'Evening Check-In', `${done} done, ${pending.length} still pending.`, 'info');
  }
}

// ─── System Notifications ────────────────────────────────────
function sendSystemNotif(title, body) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    const n = new Notification(title, {
      body,
      icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">⚡</text></svg>',
      tag: 'taskflow-alert',
      renotify: true,
    });
    n.onclick = () => { window.focus(); n.close(); };
    setTimeout(() => n.close(), 8000);
  } catch (e) { console.warn('Notification failed', e); }
}

// ─── Toast ───────────────────────────────────────────────────
function showToast(icon, title, msg, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = 'toast';

  const borderColors = {
    success: 'rgba(52,211,153,0.4)',
    warn:    'rgba(251,191,36,0.4)',
    info:    'rgba(124,90,240,0.35)',
    error:   'rgba(244,63,94,0.4)',
  };
  toast.style.borderColor = borderColors[type] || borderColors.info;
  toast.innerHTML = `
    <div class="toast-icon">${icon}</div>
    <div class="toast-body">
      <div class="toast-title">${title}</div>
      <div class="toast-msg">${msg}</div>
    </div>`;

  container.appendChild(toast);
  toast.onclick = () => removeToast(toast);
  setTimeout(() => removeToast(toast), 4000);
}

function removeToast(toast) {
  if (!toast.parentNode) return;
  toast.classList.add('removing');
  setTimeout(() => toast.parentNode?.removeChild(toast), 300);
}

// ─── Utility ─────────────────────────────────────────────────
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
