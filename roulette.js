// ===== Configuración del cilindro (ruleta americana, 38 casilleros) =====
const ORDEN_RUEDA = ['0','28','9','26','30','11','7','20','32','17','5','22','34','15','3','24','36',
  '13','1','00','27','10','25','29','12','8','19','31','18','6','21','33','16','4','23','35','14','2'];
const ROJOS = new Set(['1','3','5','7','9','12','14','16','18','19','21','23','25','27','30','32','34','36']);
const PASO = 360 / ORDEN_RUEDA.length;

function colorDeNumero(n) {
  if (n === '0' || n === '00') return 'green';
  return ROJOS.has(n) ? 'red' : 'black';
}

// ===== Estado =====
let usuario = null;
let perfil = null;
let saldoActual = 0;
let fichaSeleccionada = 25;
let apuestas = {};       
let ultimaJugada = null; 
let girando = false;
let BETS = {};
let historialNumeros = [];

const el = (id) => document.getElementById(id);

// ===== Construcción de la mesa =====
function construirMesa() {
  const mesa = el('rl-mesa');
  mesa.innerHTML = '';
  BETS = {};
  const refs = [];

  function celda(texto, claseColor, betId, numeros, mult, gridCol, gridRow) {
    const div = document.createElement('div');
    div.className = 'rl-cell ' + claseColor;
    div.innerHTML = `<span>${texto}</span>`;
    div.style.gridColumn = gridCol;
    div.style.gridRow = gridRow;
    div.addEventListener('click', () => onClickApuesta(betId));
    mesa.appendChild(div);
    BETS[betId] = { numeros, mult };
    refs.push({ id: betId, elemento: div });
    return div;
  }

  const celda00 = celda('00', 'cero green', 's-00', ['00'], 35, '1', '1 / span 1');
  const celda0 = celda('0', 'cero green', 's-0', ['0'], 35, '1', '2 / span 2');

  const numMap = {};
  const celdaNum = {};
  for (let f = 0; f < 3; f++) {
    for (let c = 0; c < 12; c++) {
      const n = (c * 3) + (3 - f);
      numMap[c + '-' + f] = String(n);
      const d = celda(String(n), colorDeNumero(String(n)), 's-' + n, [String(n)], 35, String(c + 2), String(f + 1));
      celdaNum[c + '-' + f] = d;
    }
  }

  const nombresCol = ['col3', 'col2', 'col1'];
  for (let f = 0; f < 3; f++) {
    const numeros = [];
    for (let c = 0; c < 12; c++) numeros.push(numMap[c + '-' + f]);
    celda('2:1', 'outside', 'c-' + nombresCol[f], numeros, 2, '14', String(f + 1));
  }

  const docenas = [
    { label: '1st-12', id: 'doc1', desde: 1, hasta: 12, gc: '2 / 6' },
    { label: '2nd-12', id: 'doc2', desde: 13, hasta: 24, gc: '6 / 10' },
    { label: '3rd-12', id: 'doc3', desde: 25, hasta: 36, gc: '10 / 14' },
  ];
  docenas.forEach((d) => {
    const numeros = [];
    for (let n = d.desde; n <= d.hasta; n++) numeros.push(String(n));
    celda(d.label, 'outside', d.id, numeros, 2, d.gc, '4');
  });

  const externas = [
    { label: '1-18', id: 'low', clase: 'outside', test: (n) => n >= 1 && n <= 18 },
    { label: 'PAR', id: 'even', clase: 'outside', test: (n) => n % 2 === 0 },
    { label: '', id: 'red', clase: 'red', test: (n) => ROJOS.has(String(n)) },
    { label: '', id: 'black', clase: 'black', test: (n) => !ROJOS.has(String(n)) },
    { label: 'IMPAR', id: 'odd', clase: 'outside', test: (n) => n % 2 === 1 },
    { label: '19-36', id: 'high', clase: 'outside', test: (n) => n >= 19 && n <= 36 },
  ];
  externas.forEach((ex, i) => {
    const numeros = [];
    for (let n = 1; n <= 36; n++) if (ex.test(n)) numeros.push(String(n));
    const colStart = 2 + i * 2;
    celda(ex.label, ex.clase, ex.id, numeros, 1, `${colStart} / ${colStart + 2}`, '5');
  });

  refs.forEach(({ id, elemento }) => {
    BETS[id].punto = { x: elemento.offsetLeft + elemento.offsetWidth / 2, y: elemento.offsetTop + elemento.offsetHeight / 2 };
  });

  construirHotspots(mesa, celdaNum, numMap, celda00, celda0);
}

function construirHotspots(mesa, celdaNum, numMap, celda00, celda0) {
  const capaHot = document.createElement('div'); capaHot.className = 'rl-hotspot-layer';
  const capaFichas = document.createElement('div'); capaFichas.className = 'rl-chip-layer'; capaFichas.id = 'rl-chip-layer';
  const muestra = celdaNum['0-0'];
  const HS = Math.max(12, Math.min(muestra.offsetWidth, muestra.offsetHeight) * 0.45);
  const HSTRA = Math.max(10, muestra.offsetHeight * 0.35);

  function rect(elemento) { return { l: elemento.offsetLeft, t: elemento.offsetTop, w: elemento.offsetWidth, h: elemento.offsetHeight }; }

  function agregar(id, numeros, mult, x, y, w, h, forma) {
    const hs = document.createElement('div');
    hs.className = 'rl-hotspot rl-hotspot-' + forma;
    hs.style.left = x + 'px'; hs.style.top = y + 'px'; hs.style.width = w + 'px'; hs.style.height = h + 'px';
    hs.title = numeros.join('-');
    hs.addEventListener('click', (e) => { e.stopPropagation(); onClickApuesta(id); });
    capaHot.appendChild(hs);
    BETS[id] = { numeros, mult, punto: { x: x + w / 2, y: y + h / 2 } };
  }

  // Splits, Corners, etc...
  for (let c = 0; c < 12; c++) {
    for (let f = 0; f < 2; f++) {
      const ra = rect(celdaNum[c + '-' + f]), rb = rect(celdaNum[c + '-' + (f + 1)]);
      agregar('sv-' + c + '-' + f, [numMap[c + '-' + f], numMap[c + '-' + (f + 1)]], 17, ra.l + ra.w / 2 - HS / 2, rb.t - HS / 2, HS, HS, 'punto');
    }
  }
  for (let f = 0; f < 3; f++) {
    for (let c = 0; c < 11; c++) {
      const ra = rect(celdaNum[c + '-' + f]);
      agregar('sh-' + c + '-' + f, [numMap[c + '-' + f], numMap[(c + 1) + '-' + f]], 17, ra.l + ra.w - HS / 2, ra.t + ra.h / 2 - HS / 2, HS, HS, 'punto');
    }
  }
  for (let f = 0; f < 2; f++) {
    for (let c = 0; c < 11; c++) {
      const ra = rect(celdaNum[c + '-' + f]);
      agregar('co-' + c + '-' + f, [numMap[c + '-' + f], numMap[(c + 1) + '-' + f], numMap[c + '-' + (f + 1)], numMap[(c + 1) + '-' + (f + 1)]], 8, ra.l + ra.w - HS / 2, ra.t + ra.h - HS / 2, HS, HS, 'punto');
    }
  }
  for (let c = 0; c < 12; c++) {
    const ra = rect(celdaNum[c + '-2']), w = ra.w * 0.6;
    agregar('ca-' + c, [numMap[c + '-0'], numMap[c + '-1'], numMap[c + '-2']], 11, ra.l + (ra.w - w) / 2, ra.t + ra.h - HSTRA, w, HSTRA, 'linea');
  }
  for (let c = 0; c < 11; c++) {
    const ra = rect(celdaNum[c + '-2']), w = ra.w * 0.5;
    agregar('li-' + c, [numMap[c + '-0'], numMap[c + '-1'], numMap[c + '-2'], numMap[(c + 1) + '-0'], numMap[(c + 1) + '-1'], numMap[(c + 1) + '-2']], 5, ra.l + ra.w - w / 2, ra.t + ra.h - HSTRA, w, HSTRA, 'linea');
  }
  const r3 = rect(celdaNum['0-0']), r2 = rect(celdaNum['0-1']), r1 = rect(celdaNum['0-2']), r00 = rect(celda00), xIzq = r3.l - HS / 2;
  agregar('sz-0-00', ['0', '00'], 17, r00.l + r00.w / 2 - HS / 2, r00.t + r00.h - HS / 2, HS, HS, 'punto');
  agregar('sz-00-3', ['00', '3'], 17, xIzq, r3.t + r3.h / 2 - HS / 2, HS, HS, 'punto');
  agregar('sz-0-2', ['0', '2'], 17, xIzq, r2.t + r2.h / 2 - HS / 2, HS, HS, 'punto');
  agregar('sz-0-1', ['0', '1'], 17, xIzq, r1.t + r1.h / 2 - HS / 2, HS, HS, 'punto');
  agregar('cz-00-0-2-3', ['00', '0', '2', '3'], 8, xIzq, r3.t + r3.h - HS / 2, HS, HS, 'punto');
  agregar('cz-0-1-2', ['0', '1', '2'], 11, xIzq, r2.t + r2.h - HS / 2, HS, HS, 'punto');
  agregar('cz-top-line', ['0', '00', '1', '2', '3'], 6, xIzq, r3.t - HS / 2, HS, HS, 'punto');

  mesa.appendChild(capaHot); mesa.appendChild(capaFichas);
}

// ===== Lógica de Apuestas y Límites =====
function obtenerLimite(betId, bet) {
  if (bet.mult === 35) return 20000; // Pleno (20k)
  if (betId === 'red' || betId === 'black' || betId.startsWith('c-')) return Infinity; // Colores y Filas/Columnas sin límite
  return 10000; // Todo el resto (10k)
}

function onClickApuesta(betId) {
  if (girando) return;
  const bet = BETS[betId];
  if (!bet) return;
  
  const montoActual = apuestas[betId] || 0;
  const limite = obtenerLimite(betId, bet);

  if (montoActual + fichaSeleccionada > limite) {
    mostrarAviso(`Límite superado. Máximo para esta zona: ${limite === Infinity ? 'Sin límite' : '$'+limite}`);
    return;
  }
  if (fichaSeleccionada > saldoActual - totalApostado()) {
    mostrarAviso('No te alcanza el saldo para esa ficha.');
    return;
  }

  apuestas[betId] = montoActual + fichaSeleccionada;
  pintarFicha(betId);
  actualizarResumen();
}

function pintarFicha(betId) {
  const bet = BETS[betId];
  if (!bet || !bet.punto) return;
  const capa = el('rl-chip-layer');
  if (!capa) return;
  let stack = capa.querySelector(`[data-bet="${betId}"]`);
  if (!stack) {
    stack = document.createElement('div');
    stack.className = 'rl-chip-stack';
    stack.dataset.bet = betId;
    stack.style.left = bet.punto.x + 'px';
    stack.style.top = bet.punto.y + 'px';
    capa.appendChild(stack);
  }
  const monto = apuestas[betId];
  // Mostrar valores simplificados si es muy alto
  let txt = monto;
  if (monto >= 10000) txt = (monto/1000) + 'k';
  else if (monto >= 1000) txt = (monto/1000).toFixed(1).replace('.0','') + 'k';
  stack.textContent = txt;
}

function limpiarMesa() {
  if (girando) return;
  apuestas = {};
  const capa = el('rl-chip-layer');
  if (capa) capa.innerHTML = '';
  actualizarResumen();
}

function totalApostado() { return Object.values(apuestas).reduce((a, b) => a + b, 0); }

function actualizarResumen() {
  const total = totalApostado();
  el('rl-total-apostado').textContent = formatMoney(total);
  el('rl-girar').disabled = total <= 0 || girando;
}

// ===== Rueda 3D Dinámica =====
function construirRueda() {
  const wheel = el('rl-wheel');
  wheel.innerHTML = '';
  const gradParts = [];
  const wrap = document.querySelector('.rl-wheel-wrap');
  // Toma el tamaño por CSS para que siempre quede proporcional
  const wrapSize = wrap.clientWidth || 290; 
  const labelRadius = wrapSize * 0.397;

  ORDEN_RUEDA.forEach((n, i) => {
    const desde = (i * PASO).toFixed(2), hasta = ((i + 1) * PASO).toFixed(2);
    const color = colorDeNumero(n) === 'green' ? '#0b6b3a' : (colorDeNumero(n) === 'red' ? '#a4123a' : '#1a1a1a');
    gradParts.push(`${color} ${desde}deg ${hasta}deg`);
    const label = document.createElement('div');
    label.className = 'rl-num'; label.textContent = n;
    const centro = i * PASO + PASO / 2;
    label.style.transform = `rotate(${centro}deg) translateY(-${labelRadius}px) rotate(${-centro}deg)`;
    wheel.appendChild(label);
  });

  const grosorFret = 0.4;
  const fretParts = ORDEN_RUEDA.map((_, i) => {
    const borde = (i * PASO).toFixed(2);
    return `transparent ${(i * PASO - grosorFret).toFixed(2)}deg, #e6c687 ${borde}deg, transparent ${(i * PASO + grosorFret).toFixed(2)}deg`;
  }).join(',');
  wheel.style.background = `conic-gradient(${fretParts}), conic-gradient(${gradParts.join(',')})`;
}

let rotacionAcumulada = 0;
const DURACION_GIRO_MS = 10000;
function easeOutQuint(t) { return 1 - Math.pow(1 - t, 5); }

function girarRuedaHasta(numeroGanador, callback) {
  const wrap = document.querySelector('.rl-wheel-wrap'), wheel = el('rl-wheel'), ball = el('rl-ball');
  const idx = ORDEN_RUEDA.indexOf(numeroGanador), centro = idx * PASO + PASO / 2;
  const currentMod = (rotacionAcumulada % 360 + 360) % 360;
  const targetMod = (360 - centro + 360) % 360;
  let diff = targetMod - currentMod;
  if (diff <= 0) diff += 360;

  const rotacionInicial = rotacionAcumulada;
  rotacionAcumulada += 8 * 360 + diff;
  const rotacionFinal = rotacionAcumulada;

  ball.classList.remove('asentada'); wrap.classList.add('girando');
  
  // Medidas dinámicas para que la bolita encaje sin importar el tamaño de pantalla
  const wrapSize = wrap.clientWidth || 290;
  const radioExterno = (wrapSize / 2) * 0.88; 
  const radioFinal = wrapSize * 0.397;
  const anguloTotalBolita = 12 * 360, inicio = performance.now();

  function frame(ahora) {
    const t = Math.min((ahora - inicio) / DURACION_GIRO_MS, 1), avance = easeOutQuint(t);
    wheel.style.transform = `rotate(${rotacionInicial + (rotacionFinal - rotacionInicial) * avance}deg)`;
    const angulo = -(anguloTotalBolita * avance);
    let radio;
    if (t < 0.6) { radio = radioExterno + Math.sin(t * 80) * 2 * (1 - t); } 
    else { const v = (t - 0.6) / 0.4; radio = radioFinal + (radioExterno - radioFinal) * Math.abs(Math.cos(v * Math.PI * 5)) * Math.pow(1 - v, 2); }
    ball.style.transform = `rotate(${angulo}deg) translateY(-${radio}px)`;

    if (t < 1) requestAnimationFrame(frame);
    else {
      wheel.style.transform = `rotate(${rotacionFinal}deg)`;
      ball.style.transform = `rotate(0deg) translateY(-${radioFinal}px)`;
      ball.classList.add('asentada'); wrap.classList.remove('girando');
      callback();
    }
  }
  requestAnimationFrame(frame);
}

// ===== Flujo principal =====
async function girar() {
  if (girando) return;
  const total = totalApostado();
  if (total <= 0 || total > saldoActual) {
    if (total > saldoActual) mostrarAviso('No te alcanza el saldo para esta apuesta.');
    return;
  }

  girando = true; el('rl-girar').disabled = true;
  el('rl-resultado').textContent = 'Girando...';

  ultimaJugada = { ...apuestas };
  const apuestasActuales = { ...apuestas };

  saldoActual -= total;
  await actualizarSaldoDB(saldoActual);
  await registrarTransaccion(usuario.id, 'apuesta_ruleta', -total, saldoActual, 'Apuesta en Ruleta Americana');
  pintarSaldo();

  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  const numeroGanador = ORDEN_RUEDA[buf[0] % ORDEN_RUEDA.length];

  girarRuedaHasta(numeroGanador, async () => {
    let premio = 0;
    Object.entries(apuestasActuales).forEach(([id, monto]) => {
      const bet = BETS[id];
      if (bet && bet.numeros.includes(numeroGanador)) premio += monto * (bet.mult + 1);
    });

    if (premio > 0) {
      saldoActual += premio;
      await actualizarSaldoDB(saldoActual);
      await registrarTransaccion(usuario.id, 'premio_ruleta', premio, saldoActual, 'Premio Ruleta Americana - número ' + numeroGanador);
      mostrarPremioGigante(premio);
    }

    await registrarJugadaRuleta(usuario.id, { numeroGanador, totalApostado: total, totalPremio: premio, apuestas: apuestasActuales });
    
    // Actualizar paneles laterales
    actualizarHistorial(numeroGanador);

    const color = colorDeNumero(numeroGanador);
    const nombreColor = color === 'red' ? 'ROJO' : color === 'black' ? 'NEGRO' : 'VERDE';
    el('rl-resultado').textContent = `Salió el ${numeroGanador} (${nombreColor})`;

    pintarSaldo();
    limpiarMesa();
    girando = false;
    actualizarResumen();
  });
}

function repetirApuesta() {
  if (girando || !ultimaJugada) return;
  const total = Object.values(ultimaJugada).reduce((a, b) => a + b, 0);
  if (total > saldoActual) {
    mostrarAviso('No te alcanza el saldo para repetir esa apuesta.');
    return;
  }
  apuestas = { ...ultimaJugada };
  const capa = el('rl-chip-layer');
  if (capa) capa.innerHTML = '';
  Object.keys(apuestas).forEach((id) => { if (BETS[id]) pintarFicha(id); });
  actualizarResumen();
}

// ===== Historial y Estadísticas =====
function actualizarHistorial(num) {
  historialNumeros.unshift(num);
  if (historialNumeros.length > 20) historialNumeros.pop();
  
  const divHistorial = el('rl-historial');
  divHistorial.innerHTML = '';
  historialNumeros.forEach(n => {
    const col = colorDeNumero(n);
    const span = document.createElement('div');
    span.className = `hist-item hist-${col}`;
    span.textContent = n;
    divHistorial.appendChild(span);
  });

  // Calcular Calientes
  const frecuencias = {};
  historialNumeros.forEach(n => frecuencias[n] = (frecuencias[n] || 0) + 1);
  const ordenados = Object.entries(frecuencias).sort((a,b) => b[1] - a[1]);
  const calientes = ordenados.slice(0, 3).map(x => x[0]);
  
  const divCalientes = el('rl-calientes');
  if (calientes.length > 0) {
    divCalientes.innerHTML = calientes.map(n => `<span class="stat-hot">${n}</span>`).join(' - ');
  }
}

// ===== Jugadas Guardadas (Memoria Local) =====
function obtenerJugadasLocales() {
  if (!usuario) return [];
  const key = 'ruleta_jugadas_' + usuario.id;
  const datos = localStorage.getItem(key);
  return datos ? JSON.parse(datos) : [];
}
function guardarJugadasLocales(jugadas) {
  if (!usuario) return;
  localStorage.setItem('ruleta_jugadas_' + usuario.id, JSON.stringify(jugadas));
}

function renderizarJugadasGuardadas() {
  const list = el('rl-jugadas-guardadas');
  list.innerHTML = '';
  const jugadas = obtenerJugadasLocales();
  if (jugadas.length === 0) {
    list.innerHTML = '<span style="font-size:0.8rem; color:#aaa;">No tenés jugadas guardadas.</span>';
    return;
  }
  
  jugadas.forEach((j, index) => {
    const div = document.createElement('div');
    div.className = 'jugada-item';
    
    const texto = document.createElement('span');
    texto.textContent = j.nombre;
    texto.style.flexGrow = '1';
    texto.addEventListener('click', () => cargarJugada(j.apuestas));

    const btnDel = document.createElement('button');
    btnDel.className = 'jugada-btn-del';
    btnDel.textContent = 'X';
    btnDel.addEventListener('click', (e) => {
      e.stopPropagation();
      eliminarJugada(index);
    });

    div.appendChild(texto);
    div.appendChild(btnDel);
    list.appendChild(div);
  });
}

function guardarJugadaActual() {
  const nombre = el('rl-nombre-jugada').value.trim();
  if (!nombre) { mostrarAviso('Ponele un nombre a tu jugada'); return; }
  if (Object.keys(apuestas).length === 0) { mostrarAviso('Poné fichas en la mesa primero'); return; }
  
  const jugadas = obtenerJugadasLocales();
  jugadas.push({ nombre, apuestas: { ...apuestas } });
  guardarJugadasLocales(jugadas);
  el('rl-nombre-jugada').value = '';
  renderizarJugadasGuardadas();
}

function eliminarJugada(index) {
  const jugadas = obtenerJugadasLocales();
  jugadas.splice(index, 1);
  guardarJugadasLocales(jugadas);
  renderizarJugadasGuardadas();
}

function cargarJugada(apuestasGuardadas) {
  if (girando) return;
  apuestas = { ...apuestasGuardadas };
  const capa = el('rl-chip-layer');
  if (capa) capa.innerHTML = '';
  Object.keys(apuestas).forEach((id) => { if (BETS[id]) pintarFicha(id); });
  actualizarResumen();
}

// ===== Utilidades y Modales =====
async function actualizarSaldoDB(nuevoSaldo) { await supabaseClient.from('perfiles').update({ saldo: nuevoSaldo }).eq('id', usuario.id); }
function pintarSaldo() { el('rl-saldo').textContent = formatMoney(saldoActual); }
function mostrarAviso(msg) {
  const a = el('rl-aviso');
  a.textContent = msg; a.classList.remove('hidden');
  setTimeout(() => a.classList.add('hidden'), 3500);
}
function bloquearJuego(motivo) {
  el('rl-aviso').textContent = motivo; el('rl-aviso').classList.remove('hidden');
  el('rl-girar').disabled = true;
  document.querySelectorAll('.rl-cell, .rl-hotspot').forEach((c) => c.style.pointerEvents = 'none');
}
function mostrarPremioGigante(monto) {
  el('rl-premio-monto').textContent = formatMoney(monto);
  el('rl-modal-premio').classList.remove('hidden');
}

let resizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (girando) return;
    construirRueda(); const apuestasPrevias = { ...apuestas };
    construirMesa(); apuestas = {};
    Object.entries(apuestasPrevias).forEach(([id, monto]) => { if (BETS[id]) { apuestas[id] = monto; pintarFicha(id); } });
    actualizarResumen();
  }, 250);
});

// ===== Init =====
async function init() {
  // Retrasamos unos ms la construcción inicial para asegurarnos que CSS calculó anchos
  setTimeout(() => {
    construirRueda(); 
    construirMesa(); 
    actualizarResumen();
  }, 50);

  el('rl-fichas').addEventListener('click', (e) => {
    const btn = e.target.closest('.rl-ficha');
    if (!btn) return;
    document.querySelectorAll('.rl-ficha').forEach((f) => f.classList.remove('active'));
    btn.classList.add('active');
    fichaSeleccionada = parseInt(btn.dataset.valor, 10);
  });
  el('rl-limpiar').addEventListener('click', limpiarMesa);
  el('rl-repetir').addEventListener('click', repetirApuesta);
  el('rl-girar').addEventListener('click', girar);
  el('rl-btn-guardar').addEventListener('click', guardarJugadaActual);
  
  el('rl-btn-info').addEventListener('click', () => el('rl-modal-info').classList.remove('hidden'));
  el('rl-btn-cerrar-info').addEventListener('click', () => el('rl-modal-info').classList.add('hidden'));
  el('rl-btn-cerrar-premio').addEventListener('click', () => el('rl-modal-premio').classList.add('hidden'));

  const { data: authData } = await supabaseClient.auth.getUser();
  usuario = authData && authData.user;
  if (!usuario) {
    el('rl-resultado').textContent = '';
    bloquearJuego('Iniciá sesión en el casino primero para poder jugar.');
    return;
  }

  perfil = await cargarPerfilCompleto(usuario.id);
  if (!perfil) {
    bloquearJuego('No se pudo cargar tu cuenta. Volvé al casino e intentá de nuevo.');
    return;
  }

  const bloqueo = timeoutActivo(perfil);
  if (bloqueo) {
    const textos = { cerrada: 'Tu cuenta está cerrada.', autoexclusion: 'Tenés una autoexclusión activa.', descanso: 'Estás en un descanso activo.' };
    bloquearJuego(textos[bloqueo.tipo]);
    return;
  }

  saldoActual = Number(perfil.saldo) || 0;
  pintarSaldo();
  renderizarJugadasGuardadas();
}

document.addEventListener('DOMContentLoaded', init);