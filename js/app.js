// ================== RUTAS // Route Tracker ==================

const API_BASE = '/api/routes';

// ---------- estado ----------
let map, liveLine, watchId = null;
let points = [];          // [[lat,lng], ...]
let distanceMeters = 0;
let timerInterval = null;
let elapsedSeconds = 0;
let isTracking = false;
let isPaused = false;
let startMarker = null, endMarker = null;

// ---------- elementos ----------
const $distance   = document.getElementById('stat-distance');
const $time       = document.getElementById('stat-time');
const $gpsStatus  = document.getElementById('gps-status');
const $gpsText    = document.getElementById('gps-text');

const $btnStart = document.getElementById('btn-start');
const $btnPause = document.getElementById('btn-pause');
const $btnStop  = document.getElementById('btn-stop');

const $saveModal   = document.getElementById('save-modal');
const $modalSummary= document.getElementById('modal-summary');
const $routeName   = document.getElementById('route-name');
const $btnSave     = document.getElementById('btn-save');
const $btnDiscard  = document.getElementById('btn-discard');

const $historyPanel = document.getElementById('history-panel');
const $historyList   = document.getElementById('history-list');
const $btnHistory     = document.getElementById('btn-history');
const $btnCloseHistory= document.getElementById('btn-close-history');

const $toast = document.getElementById('toast');

// ---------- mapa ----------
function initMap(){
  map = L.map('map', { zoomControl:false }).setView([13.6929, -89.2182], 15);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 19
  }).addTo(map);

  liveLine = L.polyline([], {
    color: '#00e5ff',
    weight: 5,
    opacity: 0.9,
    lineCap: 'round',
    lineJoin: 'round'
  }).addTo(map);

  // intenta centrar en la ubicación real si ya hay permiso
  if (navigator.geolocation){
    navigator.geolocation.getCurrentPosition(
      pos => map.setView([pos.coords.latitude, pos.coords.longitude], 16),
      () => {},
      { enableHighAccuracy:true, timeout:5000 }
    );
  }
}

// ---------- Haversine ----------
function haversineMeters(a, b){
  const R = 6371000;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(b[0]-a[0]);
  const dLng = toRad(b[1]-a[1]);
  const lat1 = toRad(a[0]);
  const lat2 = toRad(b[0]);
  const h = Math.sin(dLat/2)**2 + Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLng/2)**2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// ---------- formato ----------
function formatTime(totalSeconds){
  const h = Math.floor(totalSeconds/3600).toString().padStart(2,'0');
  const m = Math.floor((totalSeconds%3600)/60).toString().padStart(2,'0');
  const s = Math.floor(totalSeconds%60).toString().padStart(2,'0');
  return `${h}:${m}:${s}`;
}
function formatKm(meters){
  return (meters/1000).toFixed(2);
}

// ---------- GPS tracking ----------
function onPosition(pos){
  const { latitude, longitude, accuracy } = pos.coords;

  setGpsStatus('active', `señal activa · ±${Math.round(accuracy)}m`);

  if (isPaused) return;

  const p = [latitude, longitude];

  if (points.length > 0){
    const last = points[points.length - 1];
    const d = haversineMeters(last, p);
    // filtro simple contra ruido GPS cuando está quieto
    if (d > 2){
      distanceMeters += d;
      points.push(p);
      liveLine.addLatLng(p);
      map.panTo(p);
    }
  } else {
    points.push(p);
    liveLine.addLatLng(p);
    map.setView(p, 17);
    if (startMarker) map.removeLayer(startMarker);
    startMarker = L.circleMarker(p, {
      radius: 7, color:'#3dffb0', fillColor:'#3dffb0', fillOpacity:1, weight:2
    }).addTo(map);
  }

  $distance.textContent = formatKm(distanceMeters);
}

function onPositionError(err){
  setGpsStatus('error', gpsErrorMessage(err));
}

function gpsErrorMessage(err){
  switch(err.code){
    case err.PERMISSION_DENIED: return 'permiso de ubicación denegado';
    case err.POSITION_UNAVAILABLE: return 'ubicación no disponible';
    case err.TIMEOUT: return 'se agotó el tiempo de espera GPS';
    default: return 'error de GPS';
  }
}

function setGpsStatus(state, text){
  $gpsStatus.classList.remove('active','error');
  if (state) $gpsStatus.classList.add(state);
  $gpsText.textContent = text;
}

// ---------- timer ----------
function startTimer(){
  timerInterval = setInterval(() => {
    if (!isPaused){
      elapsedSeconds++;
      $time.textContent = formatTime(elapsedSeconds);
    }
  }, 1000);
}
function stopTimer(){
  clearInterval(timerInterval);
  timerInterval = null;
}

// ---------- control de tracking ----------
function startTracking(){
  if (!navigator.geolocation){
    setGpsStatus('error', 'este dispositivo no soporta geolocalización');
    return;
  }

  isTracking = true;
  isPaused = false;
  points = [];
  distanceMeters = 0;
  elapsedSeconds = 0;
  liveLine.setLatLngs([]);
  if (startMarker){ map.removeLayer(startMarker); startMarker=null; }
  if (endMarker){ map.removeLayer(endMarker); endMarker=null; }

  $distance.textContent = '0.00';
  $time.textContent = '00:00:00';

  setGpsStatus(null, 'buscando señal GPS…');

  watchId = navigator.geolocation.watchPosition(onPosition, onPositionError, {
    enableHighAccuracy: true,
    maximumAge: 1000,
    timeout: 10000
  });

  startTimer();

  $btnStart.disabled = true;
  $btnPause.disabled = false;
  $btnStop.disabled = false;
}

function togglePause(){
  isPaused = !isPaused;
  const label = $btnPause.querySelector('span');
  if (isPaused){
    label.textContent = 'Reanudar';
    setGpsStatus('active', 'en pausa');
  } else {
    label.textContent = 'Pausar';
  }
}

function stopTracking(){
  if (watchId !== null){
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
  stopTimer();
  isTracking = false;

  if (points.length > 0){
    endMarker = L.circleMarker(points[points.length-1], {
      radius: 7, color:'#ff2f92', fillColor:'#ff2f92', fillOpacity:1, weight:2
    }).addTo(map);
  }

  $btnStart.disabled = false;
  $btnPause.disabled = true;
  $btnStop.disabled = true;
  $btnPause.querySelector('span').textContent = 'Pausar';

  openSaveModal();
}

// ---------- modal guardar ----------
function openSaveModal(){
  $modalSummary.textContent = `${formatKm(distanceMeters)} km · ${formatTime(elapsedSeconds)}`;
  $routeName.value = '';
  $saveModal.classList.remove('hidden');
  setTimeout(() => $routeName.focus(), 100);
}
function closeSaveModal(){
  $saveModal.classList.add('hidden');
}

async function saveRoute(){
  const name = $routeName.value.trim() || `Ruta ${new Date().toLocaleDateString()}`;

  if (points.length < 2){
    showToast('Ruta muy corta para guardar');
    closeSaveModal();
    return;
  }

  const body = {
    name,
    distanceMeters,
    durationSeconds: elapsedSeconds,
    path: points
  };

  try{
    const res = await fetch(API_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error('save failed');
    closeSaveModal();
    showToast('Ruta guardada ✓');
    loadHistory();
  }catch(e){
    showToast('No se pudo guardar. Revisa el servidor.');
  }
}

function discardRoute(){
  closeSaveModal();
  liveLine.setLatLngs([]);
  if (startMarker){ map.removeLayer(startMarker); startMarker=null; }
  if (endMarker){ map.removeLayer(endMarker); endMarker=null; }
  points = [];
}

// ---------- historial ----------
async function loadHistory(){
  try{
    const res = await fetch(API_BASE);
    const routes = await res.json();
    renderHistory(routes);
  }catch(e){
    $historyList.innerHTML = '<p class="history-empty">No se pudo cargar el historial.</p>';
  }
}

function renderHistory(routes){
  if (!routes || routes.length === 0){
    $historyList.innerHTML = '<p class="history-empty">Todavía no hay rutas guardadas.</p>';
    return;
  }

  $historyList.innerHTML = '';
  routes.forEach(r => {
    const item = document.createElement('div');
    item.className = 'history-item';

    const date = new Date(r.createdAt);
    const dateStr = date.toLocaleDateString('es-SV', { day:'2-digit', month:'short' });

    item.innerHTML = `
      <div class="history-item-main">
        <span class="history-item-name">${escapeHtml(r.name)}</span>
        <span class="history-item-meta">${dateStr} · ${formatTime(r.durationSeconds)}</span>
      </div>
      <div class="history-item-stats">
        <div class="history-item-dist">${formatKm(r.distanceMeters)} km</div>
      </div>
      <button class="history-del" data-id="${r.id}" aria-label="Eliminar">
        <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
      </button>
    `;

    item.addEventListener('click', (e) => {
      if (e.target.closest('.history-del')) return;
      viewRouteOnMap(r.id);
    });

    item.querySelector('.history-del').addEventListener('click', async (e) => {
      e.stopPropagation();
      await deleteRoute(r.id);
    });

    $historyList.appendChild(item);
  });
}

async function viewRouteOnMap(id){
  try{
    const res = await fetch(`${API_BASE}/${id}`);
    const route = await res.json();
    const path = JSON.parse(route.pathJson);

    closeHistoryPanel();
    liveLine.setLatLngs(path);
    if (startMarker) map.removeLayer(startMarker);
    if (endMarker) map.removeLayer(endMarker);
    startMarker = L.circleMarker(path[0], { radius:7, color:'#3dffb0', fillColor:'#3dffb0', fillOpacity:1, weight:2 }).addTo(map);
    endMarker = L.circleMarker(path[path.length-1], { radius:7, color:'#ff2f92', fillColor:'#ff2f92', fillOpacity:1, weight:2 }).addTo(map);
    map.fitBounds(liveLine.getBounds(), { padding:[40,40] });

    $distance.textContent = formatKm(route.distanceMeters);
    $time.textContent = formatTime(route.durationSeconds);

    showToast(`Viendo: ${route.name}`);
  }catch(e){
    showToast('No se pudo cargar la ruta');
  }
}

async function deleteRoute(id){
  try{
    await fetch(`${API_BASE}/${id}`, { method:'DELETE' });
    loadHistory();
  }catch(e){
    showToast('No se pudo eliminar');
  }
}

function openHistoryPanel(){
  $historyPanel.classList.remove('hidden');
  loadHistory();
}
function closeHistoryPanel(){
  $historyPanel.classList.add('hidden');
}

// ---------- utilidades ----------
function showToast(msg){
  $toast.textContent = msg;
  $toast.classList.remove('hidden');
  requestAnimationFrame(() => $toast.classList.add('show'));
  setTimeout(() => {
    $toast.classList.remove('show');
    setTimeout(() => $toast.classList.add('hidden'), 200);
  }, 2200);
}

function escapeHtml(str){
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ---------- listeners ----------
$btnStart.addEventListener('click', startTracking);
$btnPause.addEventListener('click', togglePause);
$btnStop.addEventListener('click', stopTracking);
$btnSave.addEventListener('click', saveRoute);
$btnDiscard.addEventListener('click', discardRoute);
$btnHistory.addEventListener('click', openHistoryPanel);
$btnCloseHistory.addEventListener('click', closeHistoryPanel);

// ---------- init ----------
initMap();

// registrar service worker (PWA)
if ('serviceWorker' in navigator){
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
