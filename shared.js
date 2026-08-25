// Mismo proyecto de Supabase que usa el casino principal (Victory).
// Como este juego se sube bajo el mismo dominio frankkoo10.github.io,
// la sesión del usuario (localStorage) se comparte sola: si ya inició
// sesión en el casino, acá ya va a estar logueado.
const SUPABASE_URL = 'https://wgqqbahoalozgfukioza.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndncXFiYWhvYWxvemdmdWtpb3phIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQyNTA3OTYsImV4cCI6MjA5OTgyNjc5Nn0.v_kpYceS8ceIUBNaLLHjfyBeFA2Y3lDRy7Yn6cb5Uz8';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function formatMoney(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return '$0,00';
  return '$' + num.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Misma lógica que en el casino principal: si el usuario está en
// timeout/autoexclusión/cuenta cerrada, no puede jugar.
function timeoutActivo(perfil) {
  if (!perfil) return null;
  if (perfil.cuenta_cerrada) return { tipo: 'cerrada', until: null };
  if (perfil.autoexclusion_until && new Date(perfil.autoexclusion_until) > new Date()) {
    return { tipo: 'autoexclusion', until: new Date(perfil.autoexclusion_until) };
  }
  if (perfil.timeout_until && new Date(perfil.timeout_until) > new Date()) {
    return { tipo: 'descanso', until: new Date(perfil.timeout_until) };
  }
  return null;
}

async function cargarPerfilCompleto(userId) {
  const { data, error } = await supabaseClient
    .from('perfiles')
    .select('*')
    .eq('id', userId)
    .single();
  if (!error) return data;
  return null;
}

async function registrarTransaccion(userId, tipo, monto, saldoResultante, descripcion) {
  try {
    await supabaseClient.from('transacciones').insert([{
      user_id: userId,
      tipo,
      monto,
      saldo_resultante: saldoResultante,
      descripcion: descripcion || ''
    }]);
  } catch (e) {
    console.warn('transacciones no disponible', e);
  }
}

// Guarda la jugada en una tabla "apuestas_ruleta" si existe. Si la tabla
// todavía no fue creada en Supabase, esto falla en silencio y el juego
// sigue funcionando igual (el saldo se actualiza siempre en "perfiles").
async function registrarJugadaRuleta(userId, detalle) {
  try {
    await supabaseClient.from('apuestas_ruleta').insert([{
      user_id: userId,
      numero_ganador: detalle.numeroGanador,
      total_apostado: detalle.totalApostado,
      total_premio: detalle.totalPremio,
      resultado_neto: detalle.totalPremio - detalle.totalApostado,
      detalle_apuestas: JSON.stringify(detalle.apuestas)
    }]);
  } catch (e) {
    console.warn('apuestas_ruleta no disponible (creá la tabla si querés guardar historial)', e);
  }
}
