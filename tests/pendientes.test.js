import test from 'node:test'
import assert from 'node:assert'
import {
  horaEcuador, enHorarioLaboral, chatsQueAvisar, textoAviso, escaparHtml,
  partirPorAntiguedad,
  ESPERA_MINIMA_MS, REPETIR_CADA_MS, ESPERA_MAXIMA_MS,
} from '../lib/pendientes.js'

const MIN = 60 * 1000
// Un martes cualquiera, 15:00 UTC = 10:00 en Ecuador (UTC-5 fijo, sin verano).
const AHORA = Date.parse('2026-08-11T15:00:00.000Z')
const haceMin = (m) => new Date(AHORA - m * MIN).toISOString()

const chat = (over = {}) => ({
  telefono: '593999111222', nombre: 'Karilu', estado: 'pendiente',
  ultimoEntranteAt: haceMin(30), ultimoAvisoTelegramAt: null, ...over,
})

test('horaEcuador no depende de la zona de la maquina', () => {
  assert.equal(horaEcuador(Date.parse('2026-08-11T15:00:00.000Z')), 10)
  assert.equal(horaEcuador(Date.parse('2026-08-11T03:00:00.000Z')), 22)
  // 04:00 UTC = 23:00 del dia ANTERIOR en Ecuador. El caso que se equivoca solo.
  assert.equal(horaEcuador(Date.parse('2026-08-11T04:00:00.000Z')), 23)
})

test('el horario laboral es de 8 a 21 hora Ecuador', () => {
  assert.equal(enHorarioLaboral(Date.parse('2026-08-11T15:00:00.000Z')), true)  // 10:00
  assert.equal(enHorarioLaboral(Date.parse('2026-08-11T12:00:00.000Z')), false) // 07:00 → no
  assert.equal(enHorarioLaboral(Date.parse('2026-08-11T13:00:00.000Z')), true)  // 08:00 → sí
  assert.equal(enHorarioLaboral(Date.parse('2026-08-11T06:00:00.000Z')), false) // 01:00
})

test('avisa de un pendiente que espera mas del minimo', () => {
  assert.equal(chatsQueAvisar([chat()], AHORA).length, 1)
})

test('NO avisa de un pendiente recien llegado', () => {
  assert.equal(chatsQueAvisar([chat({ ultimoEntranteAt: haceMin(2) })], AHORA).length, 0)
})

test('NO avisa de un chat que ya no esta pendiente', () => {
  assert.equal(chatsQueAvisar([chat({ estado: 'atendido' })], AHORA).length, 0)
  assert.equal(chatsQueAvisar([chat({ estado: 'venta' })], AHORA).length, 0)
})

test('NO repite el aviso antes de la ventana de repeticion', () => {
  const yaAvisado = chat({ ultimoAvisoTelegramAt: haceMin(5) })
  assert.equal(chatsQueAvisar([yaAvisado], AHORA).length, 0)
})

test('SI vuelve a insistir pasada la ventana — es un recordatorio, no un evento', () => {
  const viejo = chat({ ultimoAvisoTelegramAt: haceMin(31) })
  assert.equal(chatsQueAvisar([viejo], AHORA).length, 1)
})

test('fuera de horario no avisa de nada', () => {
  const madrugada = Date.parse('2026-08-11T06:00:00.000Z') // 01:00 Ecuador
  assert.equal(chatsQueAvisar([chat()], madrugada).length, 0)
})

test('sin ultimoEntranteAt no avisa: no se puede medir la espera', () => {
  assert.equal(chatsQueAvisar([chat({ ultimoEntranteAt: null })], AHORA).length, 0)
})

test('el mas viejo va primero', () => {
  const lista = [
    chat({ telefono: '1', ultimoEntranteAt: haceMin(20) }),
    chat({ telefono: '2', ultimoEntranteAt: haceMin(90) }),
  ]
  assert.equal(chatsQueAvisar(lista, AHORA)[0].telefono, '2')
})

test('el texto dice cuantos son y cuanto lleva esperando el peor', () => {
  const lista = chatsQueAvisar([
    chat({ telefono: '1', nombre: 'Ana',  ultimoEntranteAt: haceMin(20) }),
    chat({ telefono: '2', nombre: 'Bea',  ultimoEntranteAt: haceMin(90) }),
  ], AHORA)
  const t = textoAviso(lista, AHORA, 'https://inbox.test')
  assert.ok(t.includes('2'), 'debe decir cuantos son')
  assert.ok(t.includes('Bea'), 'debe nombrar al que mas espera')
  assert.ok(t.includes('1 h 30 min'), `debe decir la espera legible, salio: ${t}`)
  assert.ok(t.includes('https://inbox.test/inbox?tel=2'), 'debe traer el link al chat')
})

test('con un solo chat el texto va en singular', () => {
  const t = textoAviso(chatsQueAvisar([chat({ nombre: 'Ana' })], AHORA), AHORA, 'https://inbox.test')
  assert.ok(!t.includes('chats pendientes'), `no debe pluralizar, salio: ${t}`)
})

test('las constantes son las acordadas', () => {
  assert.equal(ESPERA_MINIMA_MS, 10 * MIN)
  assert.equal(REPETIR_CADA_MS, 30 * MIN)
})

test('el borde de la espera: exactamente 10 min YA avisa', () => {
  assert.equal(chatsQueAvisar([chat({ ultimoEntranteAt: haceMin(10) })], AHORA).length, 1)
})

test('el borde de la espera: un pelo menos de 10 min NO avisa', () => {
  const casi = new Date(AHORA - (10 * MIN - 1000)).toISOString()
  assert.equal(chatsQueAvisar([chat({ ultimoEntranteAt: casi })], AHORA).length, 0)
})

test('el borde de la repeticion: exactamente 30 min SI vuelve a insistir', () => {
  assert.equal(chatsQueAvisar([chat({ ultimoAvisoTelegramAt: haceMin(30) })], AHORA).length, 1)
})

test('el borde de la repeticion: un pelo menos de 30 min todavia calla', () => {
  const casi = new Date(AHORA - (30 * MIN - 1000)).toISOString()
  assert.equal(chatsQueAvisar([chat({ ultimoAvisoTelegramAt: casi })], AHORA).length, 0)
})

test('el borde del horario: 20:00 Ecuador todavia es laboral', () => {
  assert.equal(enHorarioLaboral(Date.parse('2026-08-12T01:00:00.000Z')), true)
})

test('el borde del horario: 21:00 Ecuador ya NO', () => {
  assert.equal(enHorarioLaboral(Date.parse('2026-08-12T02:00:00.000Z')), false)
})

test('el nombre se escapa: un < en el nombre no rompe el mensaje', () => {
  const t = textoAviso(chatsQueAvisar([chat({ nombre: 'Ana <3 & Co' })], AHORA), AHORA, 'https://inbox.test')
  assert.ok(t.includes('Ana &lt;3 &amp; Co'), `el nombre tiene que ir escapado, salio: ${t}`)
  assert.ok(!t.includes('Ana <3'), 'no puede quedar el < crudo')
})

test('escaparHtml pone el & primero, sin doble escape', () => {
  assert.equal(escaparHtml('a & b < c'), 'a &amp; b &lt; c')
})

test('una espera NUEVA no la tapa el aviso viejo: contestaste y volvio a escribir', () => {
  // Aviso a las 10:00, ella escribe a las 10:02, ahora son las 10:12.
  // La marca tiene 12 min (< 30) pero es ANTERIOR al mensaje: toca avisar igual.
  const c = chat({
    ultimoAvisoTelegramAt: haceMin(12),
    ultimoEntranteAt:      haceMin(10),
  })
  assert.equal(chatsQueAvisar([c], AHORA).length, 1)
})

test('pero si el aviso es POSTERIOR al entrante, la ventana de 30 min manda', () => {
  // Mismo mensaje, ya avisado despues: es la misma espera, no repetir todavia.
  const c = chat({
    ultimoEntranteAt:      haceMin(40),
    ultimoAvisoTelegramAt: haceMin(5),
  })
  assert.equal(chatsQueAvisar([c], AHORA).length, 0)
})

// ── El techo: 2 horas en IND, NO 24 como en MANDI ──────────────────────────────
// Ver el comentario de ESPERA_MAXIMA_MS en lib/pendientes.js para el porqué y los
// numeros medidos (285 pendientes, 81 entrarian con techo de 24h, 24 con 2h).

test('el borde del techo: exactamente 2h todavia avisa', () => {
  assert.equal(chatsQueAvisar([chat({ ultimoEntranteAt: haceMin(120) })], AHORA).length, 1)
})

test('el borde del techo: un pelo mas de 2h ya NO avisa', () => {
  const viejo = new Date(AHORA - (120 * MIN + 1000)).toISOString()
  assert.equal(chatsQueAvisar([chat({ ultimoEntranteAt: viejo })], AHORA).length, 0)
})

test('un chat abandonado no se roba el aviso del reciente', () => {
  // El mismo caso de fondo que en MANDI el 12-ago (ahi con techo de 24h): un chat
  // MUY viejo no puede tapar a uno reciente. En IND el techo es de 2h, asi que
  // este de 45 dias queda afuera con margen de sobra.
  const lista = [
    chat({ telefono: '1', nombre: 'Vieja',   ultimoEntranteAt: new Date(AHORA - 45 * 24 * 60 * MIN).toISOString() }),
    chat({ telefono: '2', nombre: 'Reciente', ultimoEntranteAt: haceMin(20) }),
  ]
  const r = chatsQueAvisar(lista, AHORA)
  assert.equal(r.length, 1, 'solo entra el reciente')
  assert.equal(r[0].telefono, '2')
  assert.ok(textoAviso(r, AHORA, 'https://inbox.test').includes('Reciente'))
})

test('la constante del techo es de 2 horas, no de 24 como en MANDI', () => {
  assert.equal(ESPERA_MAXIMA_MS, 2 * 60 * 60 * 1000)
})

test('el texto plural dice "esperando respuesta hoy", no un total de pendientes', () => {
  const lista = chatsQueAvisar([
    chat({ telefono: '1', nombre: 'Ana', ultimoEntranteAt: haceMin(20) }),
    chat({ telefono: '2', nombre: 'Bea', ultimoEntranteAt: haceMin(90) }),
  ], AHORA)
  const t = textoAviso(lista, AHORA, 'https://inbox.test')
  assert.ok(t.includes('esperando respuesta hoy'), `debe decir la frase nueva, salio: ${t}`)
  assert.ok(!t.includes('chats pendientes'), `no debe decir el total de pendientes, salio: ${t}`)
})

// ── partirPorAntiguedad: el arrastre no puede quedar invisible ────────────────
// Dos revisores de MANDI cazaron el mismo defecto: un chat que cruza el techo
// desaparece del aviso de Telegram por completo, y un Telegram callado se lee
// como "bandeja limpia" — la misma familia de falla que este proyecto entero
// vino a eliminar. Pesa mas en IND que en MANDI: acá son 24 chats DENTRO del
// techo contra 285 pendientes en total, no 12 contra ~20.

test('partirPorAntiguedad separa los recientes (dentro del techo) del arrastre (mas alla)', () => {
  const lista = [
    chat({ telefono: '1', ultimoEntranteAt: haceMin(30) }),          // reciente
    chat({ telefono: '2', ultimoEntranteAt: haceMin(3 * 60) }),      // arrastre (3h > 2h)
  ]
  const { recientes, arrastre } = partirPorAntiguedad(lista, AHORA)
  assert.equal(recientes.length, 1)
  assert.equal(recientes[0].telefono, '1')
  assert.equal(arrastre.length, 1)
  assert.equal(arrastre[0].telefono, '2')
})

test('un chat que no llega al minimo no cae en ninguno de los dos baldes', () => {
  const lista = [chat({ telefono: '1', ultimoEntranteAt: haceMin(2) })] // < 10 min
  const { recientes, arrastre } = partirPorAntiguedad(lista, AHORA)
  assert.equal(recientes.length, 0)
  assert.equal(arrastre.length, 0)
})

test('el borde del techo en partirPorAntiguedad: exactamente 2h es reciente, un pelo mas es arrastre', () => {
  const enElBorde = partirPorAntiguedad([chat({ ultimoEntranteAt: haceMin(120) })], AHORA)
  assert.equal(enElBorde.recientes.length, 1)
  assert.equal(enElBorde.arrastre.length, 0)

  const pasado = new Date(AHORA - (120 * MIN + 1000)).toISOString()
  const masAlla = partirPorAntiguedad([chat({ ultimoEntranteAt: pasado })], AHORA)
  assert.equal(masAlla.recientes.length, 0)
  assert.equal(masAlla.arrastre.length, 1)
})

// El dueño trabaja con una garantía de una sola bandeja: "Pendientes" es lo único
// que cuenta como trabajo por hacer. Sin este filtro, el arrastre se llena de
// chats ATENDIDO/VENTA/ARCHIVADO viejos que no le corresponden a NADIE atender,
// y el aviso de Telegram termina mintiendo. Medido en produccion: sin filtrar por
// estado, IND diria "(+2.460 de mas de un dia)" en vez de "(+207 ...)" — el 92%
// del numero serian conversaciones que YA estan resueltas.
test('el arrastre NO cuenta chats que ya no estan pendientes', () => {
  const viejo = new Date(AHORA - 45 * 24 * 60 * MIN).toISOString()
  const lista = [
    chat({ telefono: '1', estado: 'atendido',  ultimoEntranteAt: viejo }),
    chat({ telefono: '2', estado: 'venta',     ultimoEntranteAt: viejo }),
    chat({ telefono: '3', estado: 'archivado', ultimoEntranteAt: viejo }),
    chat({ telefono: '4', estado: 'pendiente', ultimoEntranteAt: viejo }),
  ]
  const { arrastre } = partirPorAntiguedad(lista, AHORA)
  assert.equal(arrastre.length, 1, 'solo el pendiente')
  assert.equal(arrastre[0].telefono, '4')
})

test('recientes tampoco cuenta un atendido reciente', () => {
  const lista = [
    chat({ telefono: '1', estado: 'atendido',  ultimoEntranteAt: haceMin(30) }),
    chat({ telefono: '2', estado: 'pendiente', ultimoEntranteAt: haceMin(30) }),
  ]
  const { recientes } = partirPorAntiguedad(lista, AHORA)
  assert.equal(recientes.length, 1)
  assert.equal(recientes[0].telefono, '2')
})

// ── textoAviso con arrastre: mencionado, nunca escondido ────────────────────
test('con arrastre, el mensaje nombra cuantos chats de mas quedaron afuera', () => {
  const lista = chatsQueAvisar([chat({ nombre: 'Ana' })], AHORA)
  const t = textoAviso(lista, AHORA, 'https://inbox.test', 207)
  assert.ok(t.includes('207'), `debe nombrar el numero de arrastre, salio: ${t}`)
  assert.ok(t.includes('('), `debe ir en su propio parentesis, salio: ${t}`)
})

test('sin arrastre, no aparece ningun parentesis de mas', () => {
  const lista = chatsQueAvisar([chat({ nombre: 'Ana' })], AHORA)
  const t = textoAviso(lista, AHORA, 'https://inbox.test', 0)
  assert.ok(!t.includes('('), `no debe haber parentesis, salio: ${t}`)
})

test('llamar textoAviso con 3 argumentos es identico a pasar 0 explicito', () => {
  const lista = chatsQueAvisar([
    chat({ telefono: '1', nombre: 'Ana', ultimoEntranteAt: haceMin(20) }),
    chat({ telefono: '2', nombre: 'Bea', ultimoEntranteAt: haceMin(90) }),
  ], AHORA)
  const conTres  = textoAviso(lista, AHORA, 'https://inbox.test')
  const conCero  = textoAviso(lista, AHORA, 'https://inbox.test', 0)
  assert.equal(conTres, conCero)
})
