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
let apuestas = {};       // clave "tipo:valor" -> monto
let ultimaJugada = null; // para "repetir"
let girando = false;

const el = (id) => document.getElementById(id);

// ===== Construcción de la mesa =====
function construirMesa() {
  const mesa = el('rl-mesa');
  mesa.innerHTML = '';

  // 00 (arriba, ocupa el ancho de la columna 1)
  const cero00 = celda('00', 'cero green', 'straight', '00');
  cero00.style.gridColumn = '1';
  cero00.style.gridRow = '1 / span 1';
  mesa.appendChild(cero00);

  // 0 (ocupa filas 2 y 3)
  const cero0 = celda('0', 'cero green', 'straight', '0');
  cero0.style.gridColumn = '1';
  cero0.style.gridRow = '2 / span 2';
  mesa.appendChild(cero0);

  // Números 1-36, 3 filas x 12 columnas
  // fila 1 (arriba): 3,6,9...36  | fila 2: 2,5,8...35 | fila 3 (abajo): 1,4,7...34
  for (let fila = 0; fila < 3; fila++) {
    for (let col = 0; col < 12; col++) {
      const n = (col * 3) + (3 - fila);
      const c = celda(String(n), colorDeNumero(String(n)), 'straight', String(n));
      c.style.gridColumn = String(col + 2);
      c.style.gridRow = String(fila + 1);
      mesa.appendChild(c);
    }
  }

  // Columnas 2:1 (a la derecha de cada fila)
  const nombresCol = ['col3', 'col2', 'col1']; // fila1=numeros altos de cada columna, etc.
  for (let fila = 0; fila < 3; fila++) {
    const c = celda('2:1', 'outside', 'columna', nombresCol[fila]);
    c.style.gridColumn = '14';
    c.style.gridRow = String(fila + 1);
    mesa.appendChild(c);
  }

  // Docenas
  const docenas = [
    { label: '1st-12', val: 'd1', desde: 2, hasta: 5 },
    { label: '2nd-12', val: 'd2', desde: 6, hasta: 9 },
    { label: '3rd-12', val: 'd3', desde: 10, hasta: 13 },
  ];
  docenas.forEach((d) => {
    const c = celda(d.label, 'outside', 'docena', d.val);
    c.style.gridColumn = `${d.desde} / ${d.hasta}`;
    c.style.gridRow = '4';
    el('rl-mesa').appendChild(c);
  });

  // Apuestas externas: 1-18, EVEN, RED, BLACK, ODD, 19-36
  const externas = [
    { label: '1-18', val: 'low', clase: 'outside' },
    { label: 'PAR', val: 'even', clase: 'outside' },
    { label: '', val: 'red', clase: 'red' },
    { label: '', val: 'black', clase: 'black' },
    { label: 'IMPAR', val: 'odd', clase: 'outside' },
    { label: '19-36', val: 'high', clase: 'outside' },
  ];
  const colStart = 2;
  externas.forEach((ex, i) => {
    const span = 2; // 12 columnas / 6 apuestas = 2 cada una
    const c = celda(ex.label, ex.clase, 'externa', ex.val);
    c.style.gridColumn = `${colStart + i * span} / ${colStart + i * span + span}`;
    c.style.gridRow = '5';
    el('rl-mesa').appendChild(c);
  });
}

function celda(texto, claseColor, tipo, valor) {
  const div = document.createElement('div');
  div.className = 'rl-cell ' + claseColor;
  div.dataset.tipo = tipo;
  div.dataset.valor = valor;
  div.innerHTML = `<span>${texto}</span>`;
  div.addEventListener('click', () => onClickCelda(tipo, valor, div));
  return div;
}

// ===== Apuestas =====
function onClickCelda(tipo, valor, elemento) {
  if (girando) return;
  if (fichaSeleccionada > saldoActual - totalApostado()) {
    mostrarAviso('No te alcanza el saldo para esa ficha.');
    return;
  }
  const clave = tipo + ':' + valor;
  apuestas[clave] = (apuestas[clave] || 0) + fichaSeleccionada;
  actualizarStackVisual(elemento, apuestas[clave]);
  actualizarResumen();
}

function actualizarStackVisual(elemento, monto) {
  let stack = elemento.querySelector('.rl-chip-stack');
  if (!stack) {
    stack = document.createElement('div');
    stack.className = 'rl-chip-stack';
    elemento.appendChild(stack);
  }
  stack.textContent = monto >= 1000 ? Math.round(monto / 1000) + 'k' : monto;
}

function limpiarMesa() {
  if (girando) return;
  apuestas = {};
  document.querySelectorAll('.rl-chip-stack').forEach((s) => s.remove());
  actualizarResumen();
}

function totalApostado() {
  return Object.values(apuestas).reduce((a, b) => a + b, 0);
}

function actualizarResumen() {
  const total = totalApostado();
  el('rl-total-apostado').textContent = formatMoney(total);
  // premio máximo posible (aprox, mostrando el mejor caso: pleno x36)
  let posible = 0;
  Object.entries(apuestas).forEach(([clave, monto]) => {
    const [tipo] = clave.split(':');
    const mult = { straight: 36, columna: 3, docena: 3, externa: 2 }[tipo] || 1;
    posible += monto * mult;
  });
  el('rl-posible-premio').textContent = formatMoney(posible);
  el('rl-girar').disabled = total <= 0 || girando;
}

// ===== Evaluación de premios =====
function ganaApuesta(tipo, valor, numeroGanador) {
  if (tipo === 'straight') return valor === numeroGanador;
  if (numeroGanador === '0' || numeroGanador === '00') return false; // pierde todo lo demás
  const n = parseInt(numeroGanador, 10);
  if (tipo === 'docena') {
    if (valor === 'd1') return n >= 1 && n <= 12;
    if (valor === 'd2') return n >= 13 && n <= 24;
    if (valor === 'd3') return n >= 25 && n <= 36;
  }
  if (tipo === 'columna') {
    if (valor === 'col1') return n % 3 === 1;
    if (valor === 'col2') return n % 3 === 2;
    if (valor === 'col3') return n % 3 === 0;
  }
  if (tipo === 'externa') {
    if (valor === 'low') return n >= 1 && n <= 18;
    if (valor === 'high') return n >= 19 && n <= 36;
    if (valor === 'even') return n % 2 === 0;
    if (valor === 'odd') return n % 2 === 1;
    if (valor === 'red') return ROJOS.has(String(n));
    if (valor === 'black') return !ROJOS.has(String(n));
  }
  return false;
}

function multiplicador(tipo) {
  return { straight: 35, docena: 2, columna: 2, externa: 1 }[tipo] || 0;
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
  wheel.style.background = `conic-gradient(${gradParts.join(',')})`;
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
  const objetivo = vueltasRueda * 360 + (360 - centro);
  rotacionAcumulada += objetivo;

  wrap.classList.add('girando');
  wheel.style.transform = `rotate(${rotacionAcumulada}deg)`;

  // Radios de la pelota calculados sobre el tamaño real de la rueda (responsive)
  const wrapSize = wrap.clientWidth || 340;
  const radioExterno = (wrapSize / 2) * 0.9;   // pegada al borde exterior, girando rápido
  const radioFinal = wrapSize * 0.397;         // mismo radio que los números (donde "cae" en el casillero)

  // La pelota gira en sentido contrario a la rueda, muchas vueltas, frenando,
  // y termina exactamente en un múltiplo de 360° (arriba, bajo el puntero),
  // que es donde la rueda deja alineado el número ganador.
  const vueltasBolita = 13;
  const anguloTotalBolita = vueltasBolita * 360;

  const inicio = performance.now();

  function frame(ahora) {
    const t = Math.min((ahora - inicio) / DURACION_GIRO_MS, 1);
    const avance = easeOutQuint(t);

    // Ángulo: gira para atrás (sentido contrario a la rueda) y decelera hasta 0 exacto
    const angulo = -(anguloTotalBolita * avance);

    // Radio: se mantiene arriba (pista exterior) con un leve "traqueteo",
    // y a partir del 55% del giro empieza a "caer" rebotando en los números
    // hasta asentarse en el casillero ganador.
    let radio;
    if (t < 0.55) {
      const wobble = Math.sin(t * 90) * 2.5 * (1 - t); // vibración de la pista, se atenúa
      radio = radioExterno + wobble;
    } else {
      const v = (t - 0.55) / 0.45; // 0..1 en la fase de caída
      const rebote = Math.abs(Math.cos(v * Math.PI * 3)) * Math.pow(1 - v, 2);
      radio = radioFinal + (radioExterno - radioFinal) * rebote;
    }

    ball.style.transform = `rotate(${angulo}deg) translateY(-${radio}px)`;

    if (t < 1) {
      requestAnimationFrame(frame);
    } else {
      ball.style.transform = `rotate(0deg) translateY(-${radioFinal}px)`;
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
    Object.entries(apuestasActuales).forEach(([clave, monto]) => {
      const [tipo, valor] = clave.split(':');
      if (ganaApuesta(tipo, valor, numeroGanador)) {
        premio += monto * (multiplicador(tipo) + 1);
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
  document.querySelectorAll('.rl-cell').forEach((c) => {
    const clave = c.dataset.tipo + ':' + c.dataset.valor;
    if (apuestas[clave]) actualizarStackVisual(c, apuestas[clave]);
  });
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
  document.querySelectorAll('.rl-cell').forEach((c) => c.style.pointerEvents = 'none');
}

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
