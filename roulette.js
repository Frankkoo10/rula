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
let apuestas = {};       // clave = id de apuesta (ver BETS) -> monto
let ultimaJugada = null; // para "repetir"
let girando = false;

// Registro de TODAS las apuestas posibles de la mesa: pleno, a caballo,
// calle, esquina, linea, columna, docena, exterior y las combinaciones
// clasicas con el 0/00. Se reconstruye cada vez que se arma la mesa.
// id -> { numeros: [...], mult: N (paga N a 1), punto: {x, y} }
let BETS = {};

const el = (id) => document.getElementById(id);

// ===== Construcción de la mesa =====
function construirMesa() {
  const mesa = el('rl-mesa');
  mesa.innerHTML = '';
  BETS = {};
  const refs = []; // celdas "simples" (pleno, exterior, docena, columna) para calcular su centro despues

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

  // 00 (arriba) y 0 (ocupa dos filas)
  celda('00', 'cero green', 's-00', ['00'], 35, '1', '1 / span 1');
  celda('0', 'cero green', 's-0', ['0'], 35, '1', '2 / span 2');

  // Números 1-36, 3 filas x 12 columnas. Guardamos numero y elemento de
  // cada celda para poder ubicar despues, con precision de pixel, los
  // puntos de apuesta a caballo / esquina / calle / linea sobre los bordes
  // reales de la grilla (asi las fichas quedan exactamente donde se hizo
  // click, como en una mesa real).
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

  // Columnas 2:1
  const nombresCol = ['col3', 'col2', 'col1'];
  for (let f = 0; f < 3; f++) {
    const numeros = [];
    for (let c = 0; c < 12; c++) numeros.push(numMap[c + '-' + f]);
    celda('2:1', 'outside', 'c-' + nombresCol[f], numeros, 2, '14', String(f + 1));
  }

  // Docenas (cada una cubre 4 columnas de numeros = 12 numeros reales;
  // antes el recuadro visual quedaba corto y sólo tapaba 9 numeros)
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

  // Apuestas externas: 1-18, PAR, ROJO, NEGRO, IMPAR, 19-36
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

  // Centro real (en pixeles) de cada celda simple, para posicionar su ficha
  refs.forEach(({ id, elemento }) => {
    BETS[id].punto = {
      x: elemento.offsetLeft + elemento.offsetWidth / 2,
      y: elemento.offsetTop + elemento.offsetHeight / 2,
    };
  });

  construirHotspots(mesa, celdaNum, numMap);
}

// Genera los puntos de apuesta "a caballo" (split), "esquina" (corner),
// "calle" (street) y "linea" (six line), además de las combinaciones
// clásicas que incluyen al 0 y al 00 (splits, "canasta" y la apuesta de
// los 5 números / top line). Todos se ubican midiendo las celdas ya
// renderizadas, así quedan exactamente sobre los bordes/cruces reales,
// igual que en una mesa física.
function construirHotspots(mesa, celdaNum, numMap) {
  const capaHot = document.createElement('div');
  capaHot.className = 'rl-hotspot-layer';
  const capaFichas = document.createElement('div');
  capaFichas.className = 'rl-chip-layer';
  capaFichas.id = 'rl-chip-layer';

  const muestra = celdaNum['0-0'];
  const HS = Math.max(12, Math.min(muestra.offsetWidth, muestra.offsetHeight) * 0.42);
  const HSTRA = Math.max(10, muestra.offsetHeight * 0.32);

  function rect(elemento) {
    return { l: elemento.offsetLeft, t: elemento.offsetTop, w: elemento.offsetWidth, h: elemento.offsetHeight };
  }

  function agregar(id, numeros, mult, x, y, w, h, forma) {
    const hs = document.createElement('div');
    hs.className = 'rl-hotspot rl-hotspot-' + forma;
    hs.style.left = x + 'px';
    hs.style.top = y + 'px';
    hs.style.width = w + 'px';
    hs.style.height = h + 'px';
    hs.title = numeros.join('-');
    hs.addEventListener('click', (e) => { e.stopPropagation(); onClickApuesta(id); });
    capaHot.appendChild(hs);
    BETS[id] = { numeros, mult, punto: { x: x + w / 2, y: y + h / 2 } };
  }

  // Splits verticales (a caballo, dentro de una misma columna de numeros)
  for (let c = 0; c < 12; c++) {
    for (let f = 0; f < 2; f++) {
      const ra = rect(celdaNum[c + '-' + f]);
      const rb = rect(celdaNum[c + '-' + (f + 1)]);
      agregar('sv-' + c + '-' + f, [numMap[c + '-' + f], numMap[c + '-' + (f + 1)]], 17,
        ra.l + ra.w / 2 - HS / 2, rb.t - HS / 2, HS, HS, 'punto');
    }
  }

  // Splits horizontales (entre columnas vecinas, misma fila)
  for (let f = 0; f < 3; f++) {
    for (let c = 0; c < 11; c++) {
      const ra = rect(celdaNum[c + '-' + f]);
      agregar('sh-' + c + '-' + f, [numMap[c + '-' + f], numMap[(c + 1) + '-' + f]], 17,
        ra.l + ra.w - HS / 2, ra.t + ra.h / 2 - HS / 2, HS, HS, 'punto');
    }
  }

  // Esquinas (4 numeros que se tocan en un cruce)
  for (let f = 0; f < 2; f++) {
    for (let c = 0; c < 11; c++) {
      const ra = rect(celdaNum[c + '-' + f]);
      agregar('co-' + c + '-' + f, [
        numMap[c + '-' + f], numMap[(c + 1) + '-' + f],
        numMap[c + '-' + (f + 1)], numMap[(c + 1) + '-' + (f + 1)],
      ], 8, ra.l + ra.w - HS / 2, ra.t + ra.h - HS / 2, HS, HS, 'punto');
    }
  }

  // Calle (3 numeros de una misma columna) - franja sobre el borde inferior
  for (let c = 0; c < 12; c++) {
    const ra = rect(celdaNum[c + '-2']);
    const w = ra.w * 0.6;
    agregar('ca-' + c, [numMap[c + '-0'], numMap[c + '-1'], numMap[c + '-2']], 11,
      ra.l + (ra.w - w) / 2, ra.t + ra.h - HSTRA, w, HSTRA, 'linea');
  }

  // Linea (6 numeros, dos calles vecinas)
  for (let c = 0; c < 11; c++) {
    const ra = rect(celdaNum[c + '-2']);
    const w = ra.w * 0.5;
    agregar('li-' + c, [
      numMap[c + '-0'], numMap[c + '-1'], numMap[c + '-2'],
      numMap[(c + 1) + '-0'], numMap[(c + 1) + '-1'], numMap[(c + 1) + '-2'],
    ], 5, ra.l + ra.w - w / 2, ra.t + ra.h - HSTRA, w, HSTRA, 'linea');
  }

  // Combinaciones con el 0 y el 00, ubicadas sobre el borde izquierdo de la
  // primer columna de numeros, que es donde se tocan en una ruleta real:
  // el 00 esta a la altura del 3, y el 0 (que ocupa dos filas) esta a la
  // altura del 2 y del 1.
  const r3 = rect(celdaNum['0-0']); // fila del 3, toca al 00
  const r2 = rect(celdaNum['0-1']); // fila del 2, mitad de arriba del 0
  const r1 = rect(celdaNum['0-2']); // fila del 1, mitad de abajo del 0
  const xIzq = r3.l - HS / 2;

  agregar('sz-00-3', ['00', '3'], 17, xIzq, r3.t + r3.h / 2 - HS / 2, HS, HS, 'punto');
  agregar('sz-0-2', ['0', '2'], 17, xIzq, r2.t + r2.h / 2 - HS / 2, HS, HS, 'punto');
  agregar('sz-0-1', ['0', '1'], 17, xIzq, r1.t + r1.h / 2 - HS / 2, HS, HS, 'punto');
  agregar('cz-00-0-2-3', ['00', '0', '2', '3'], 8, xIzq, r3.t + r3.h - HS / 2, HS, HS, 'punto');
  agregar('cz-0-1-2', ['0', '1', '2'], 11, xIzq, r2.t + r2.h - HS / 2, HS, HS, 'punto');
  agregar('cz-top-line', ['0', '00', '1', '2', '3'], 6, xIzq, r3.t - HS / 2, HS, HS, 'punto');

  mesa.appendChild(capaHot);
  mesa.appendChild(capaFichas);
}

// ===== Apuestas =====
function onClickApuesta(betId) {
  if (girando) return;
  const bet = BETS[betId];
  if (!bet) return;
  if (fichaSeleccionada > saldoActual - totalApostado()) {
    mostrarAviso('No te alcanza el saldo para esa ficha.');
    return;
  }
  apuestas[betId] = (apuestas[betId] || 0) + fichaSeleccionada;
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
  stack.textContent = monto >= 1000 ? Math.round(monto / 1000) + 'k' : monto;
}

function limpiarMesa() {
  if (girando) return;
  apuestas = {};
  const capa = el('rl-chip-layer');
  if (capa) capa.innerHTML = '';
  actualizarResumen();
}

function totalApostado() {
  return Object.values(apuestas).reduce((a, b) => a + b, 0);
}

function actualizarResumen() {
  const total = totalApostado();
  el('rl-total-apostado').textContent = formatMoney(total);
  let posible = 0;
  Object.entries(apuestas).forEach(([id, monto]) => {
    const bet = BETS[id];
    if (bet) posible += monto * (bet.mult + 1);
  });
  el('rl-posible-premio').textContent = formatMoney(posible);
  el('rl-girar').disabled = total <= 0 || girando;
}

// ===== Rueda 3D =====
function construirRueda() {
  const wheel = el('rl-wheel');
  wheel.innerHTML = '';
  const gradParts = [];
  const wrap = document.querySelector('.rl-wheel-wrap');
  const wrapSize = (wrap && wrap.clientWidth) || 340;
  const labelRadius = wrapSize * 0.397; // proporción calibrada sobre el diseño original (135/340)

  ORDEN_RUEDA.forEach((n, i) => {
    const desde = (i * PASO).toFixed(2);
    const hasta = ((i + 1) * PASO).toFixed(2);
    const color = colorDeNumero(n) === 'green' ? '#0b6b3a' : (colorDeNumero(n) === 'red' ? '#a4123a' : '#1a1a1a');
    gradParts.push(`${color} ${desde}deg ${hasta}deg`);

    const label = document.createElement('div');
    label.className = 'rl-num';
    label.textContent = n;
    const centro = i * PASO + PASO / 2;
    label.style.transform = `rotate(${centro}deg) translateY(-${labelRadius}px) rotate(${-centro}deg)`;
    wheel.appendChild(label);
  });

  // Separadores metálicos (frets) entre cada casillero, como en una ruleta
  // real: una línea fina y clara justo en el borde de cada sector. Estos
  // "frets" son las barreras contra las que la bolita rebota antes de
  // asentarse en un casillero exacto (ver girarRuedaHasta).
  const grosorFret = 0.35; // grados
  const fretParts = ORDEN_RUEDA.map((_, i) => {
    const borde = (i * PASO).toFixed(2);
    return `transparent ${(i * PASO - grosorFret).toFixed(2)}deg, rgba(220,190,140,.85) ${borde}deg, transparent ${(i * PASO + grosorFret).toFixed(2)}deg`;
  }).join(',');

  wheel.style.background =
    `conic-gradient(${fretParts}), conic-gradient(${gradParts.join(',')})`;
}

let rotacionAcumulada = 0;
const DURACION_GIRO_MS = 10000;

// easing de deceleración fuerte (la rueda y la bolita van frenando hasta detenerse)
function easeOutQuint(t) { return 1 - Math.pow(1 - t, 5); }

function girarRuedaHasta(numeroGanador, callback) {
  const wrap = document.querySelector('.rl-wheel-wrap');
  const wheel = el('rl-wheel');
  const ball = el('rl-ball');

  const idx = ORDEN_RUEDA.indexOf(numeroGanador);
  const centro = idx * PASO + PASO / 2;
  const vueltasRueda = 9;
  // el puntero está arriba (0deg); giramos para que el centro del casillero quede en 0deg
  const rotacionInicial = rotacionAcumulada;
  const objetivo = vueltasRueda * 360 + (360 - centro);
  rotacionAcumulada += objetivo;
  const rotacionFinal = rotacionAcumulada;

  ball.classList.remove('asentada');
  wrap.classList.add('girando');

  // Radios de la pelota calculados sobre el tamaño real de la rueda (responsive)
  const wrapSize = wrap.clientWidth || 340;
  const radioExterno = (wrapSize / 2) * 0.9;   // pegada al borde exterior, girando rápido
  const radioFinal = wrapSize * 0.397;         // mismo radio que los números (donde "cae" en el casillero)

  const vueltasBolita = 13;
  const anguloTotalBolita = vueltasBolita * 360;

  const inicio = performance.now();

  function frame(ahora) {
    const t = Math.min((ahora - inicio) / DURACION_GIRO_MS, 1);
    // MISMA curva de avance para la rueda y la bolita: antes la rueda se
    // movía con una transición CSS (otra curva) mientras la bolita se
    // animaba con JS (otra distinta), así que podían desincronizarse y la
    // bolita parecía "caer en cualquier lado". Ahora las dos comparten
    // exactamente el mismo progreso en cada cuadro, así que siempre
    // terminan alineadas: la bolita cae justo en el casillero ganador,
    // nunca a mitad de camino entre dos números.
    const avance = easeOutQuint(t);

    const anguloRueda = rotacionInicial + (rotacionFinal - rotacionInicial) * avance;
    wheel.style.transform = `rotate(${anguloRueda}deg)`;

    const angulo = -(anguloTotalBolita * avance);

    // Radio: se mantiene arriba (pista exterior) con un leve "traqueteo",
    // y a partir del 55% del giro empieza a "caer" rebotando contra los
    // separadores (frets) -las barreras- hasta asentarse exactamente en
    // el casillero ganador, sin overshoot.
    let radio;
    if (t < 0.55) {
      const wobble = Math.sin(t * 90) * 2.5 * (1 - t);
      radio = radioExterno + wobble;
    } else {
      const v = (t - 0.55) / 0.45;
      const rebote = Math.abs(Math.cos(v * Math.PI * 4.5)) * Math.pow(1 - v, 2.2);
      radio = radioFinal + (radioExterno - radioFinal) * rebote;
    }

    ball.style.transform = `rotate(${angulo}deg) translateY(-${radio}px)`;

    if (t < 1) {
      requestAnimationFrame(frame);
    } else {
      // snap final exacto: rueda y bolita quedan perfectamente alineadas
      wheel.style.transform = `rotate(${rotacionFinal}deg)`;
      ball.style.transform = `rotate(0deg) translateY(-${radioFinal}px)`;
      ball.classList.add('asentada');
      wrap.classList.remove('girando');
      callback();
    }
  }
  requestAnimationFrame(frame);
}

// ===== Flujo principal =====
async function girar() {
  if (girando) return;
  const total = totalApostado();
  if (total <= 0) return;
  if (total > saldoActual) {
    mostrarAviso('No te alcanza el saldo para esta apuesta.');
    return;
  }

  girando = true;
  el('rl-girar').disabled = true;
  el('rl-resultado').textContent = 'Girando...';

  ultimaJugada = { ...apuestas };
  const apuestasActuales = { ...apuestas };

  // Descuenta el total apostado del saldo (como en una mesa real).
  saldoActual -= total;
  await actualizarSaldoDB(saldoActual);
  await registrarTransaccion(usuario.id, 'apuesta_ruleta', -total, saldoActual, 'Apuesta en Ruleta Americana');
  pintarSaldo();

  // Número random criptográficamente seguro entre los 38 casilleros.
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  const numeroGanador = ORDEN_RUEDA[buf[0] % ORDEN_RUEDA.length];

  girarRuedaHasta(numeroGanador, async () => {
    let premio = 0;
    Object.entries(apuestasActuales).forEach(([id, monto]) => {
      const bet = BETS[id];
      if (bet && bet.numeros.includes(numeroGanador)) {
        premio += monto * (bet.mult + 1);
      }
    });

    if (premio > 0) {
      saldoActual += premio;
      await actualizarSaldoDB(saldoActual);
      await registrarTransaccion(usuario.id, 'premio_ruleta', premio, saldoActual, 'Premio Ruleta Americana - número ' + numeroGanador);
    }

    await registrarJugadaRuleta(usuario.id, {
      numeroGanador,
      totalApostado: total,
      totalPremio: premio,
      apuestas: apuestasActuales
    });

    const color = colorDeNumero(numeroGanador);
    const nombreColor = color === 'red' ? 'ROJO' : color === 'black' ? 'NEGRO' : 'VERDE';
    el('rl-resultado').textContent = `Salió el ${numeroGanador} (${nombreColor}) — ` +
      (premio > 0 ? `¡Ganaste ${formatMoney(premio)}!` : 'Sin premio esta vez.');

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

// ===== Supabase: saldo y perfil =====
async function actualizarSaldoDB(nuevoSaldo) {
  await supabaseClient.from('perfiles').update({ saldo: nuevoSaldo }).eq('id', usuario.id);
}

function pintarSaldo() {
  el('rl-saldo').textContent = formatMoney(saldoActual);
}

function mostrarAviso(msg) {
  const a = el('rl-aviso');
  a.textContent = msg;
  a.classList.remove('hidden');
  setTimeout(() => a.classList.add('hidden'), 3500);
}

function bloquearJuego(motivo) {
  el('rl-aviso').textContent = motivo;
  el('rl-aviso').classList.remove('hidden');
  el('rl-girar').disabled = true;
  document.querySelectorAll('.rl-cell, .rl-hotspot').forEach((c) => c.style.pointerEvents = 'none');
}

// Si la ventana cambia de tamaño, recalculamos rueda y mesa (los puntos de
// apuesta están medidos en píxeles) conservando las fichas ya puestas.
let resizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (girando) return;
    construirRueda();
    const apuestasPrevias = { ...apuestas };
    construirMesa();
    apuestas = {};
    Object.entries(apuestasPrevias).forEach(([id, monto]) => {
      if (BETS[id]) {
        apuestas[id] = monto;
        pintarFicha(id);
      }
    });
    actualizarResumen();
  }, 250);
});

// ===== Init =====
async function init() {
  construirRueda();
  construirMesa();
  actualizarResumen();

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
    const textos = {
      cerrada: 'Tu cuenta está cerrada.',
      autoexclusion: 'Tenés una autoexclusión activa.',
      descanso: 'Estás en un descanso activo.'
    };
    bloquearJuego(textos[bloqueo.tipo]);
    return;
  }

  saldoActual = Number(perfil.saldo) || 0;
  pintarSaldo();
}

document.addEventListener('DOMContentLoaded', init);
