/* ═══════════════════════════════════════════════════════════════
   MANDARINA REPUBLIC — MAPA INTERACTIVO
   Motor de la sección "MR · Mapa interactivo" (mrh-mapa.liquid).

   El mundo se genera a partir de los bloques de la sección: dos filas
   de edificios, avenidas, callejones y bosque de borde salen solos
   según cuántos universos haya. Todo el arte se dibuja acá con
   rectángulos y sprites en texto: no hay una sola imagen de tercero.

   El mundo se pinta UNA vez en un canvas fuera de pantalla y después
   cada frame solo copia el trozo visible y dibuja a los personajes.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  function init(ROOT) {
    if (!ROOT || ROOT.dataset.ready) return;
    ROOT.dataset.ready = '1';

  var ZONES = [];
  try { ZONES = JSON.parse(ROOT.querySelector('.mrmap__data').textContent) || []; } catch (e) {}
  ZONES = ZONES.slice(0, 12);
  if (!ZONES.length) { ROOT.style.display = 'none'; return; }


  var stage  = ROOT.querySelector('.mrmap__stage');
  var cv     = ROOT.querySelector('.mrmap__cv');
  var ctx    = cv.getContext('2d');
  var tagBox = ROOT.querySelector('.mrmap__tags');
  var hint   = ROOT.querySelector('.mrmap__hint');
  var dlg    = ROOT.querySelector('.mrmap__dlg');
  var rail   = ROOT.querySelector('.mrmap__rail');
  var REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ═══════════ paleta del mundo ═══════════ */
  var C = {
    ink:'#0F0B07', grass:'#4FA83E', grass2:'#5CBF49', grass3:'#3E8A32',
    path:'#E8C98F', path2:'#D9B478', path3:'#C79E63',
    wall:'#FFF8F2', wall2:'#E7DACD', stone:'#CFC3B6',
    wood:'#6B4A2A', wood2:'#4E3520',
    leaf:'#2F7A2C', leaf2:'#3F9438', leaf3:'#215C20',
    water:'#3FA9E8', water2:'#6EC6F2', zest:'#FFC400'
  };
  function px(g, x, y, w, h, c) { g.fillStyle = c; g.fillRect(x | 0, y | 0, w | 0, h | 0); }
  function rng(seed) { var s = seed >>> 0; return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
  function shade(hex, k) {
    var n = parseInt(hex.replace('#', ''), 16);
    var r = Math.max(0, Math.min(255, ((n >> 16) & 255) * k)) | 0;
    var g = Math.max(0, Math.min(255, ((n >> 8) & 255) * k)) | 0;
    var b = Math.max(0, Math.min(255, (n & 255) * k)) | 0;
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  /* ═══════════ geometría del mundo ═══════════ */
  var TS = 16, BW = 7, BH = 6, GAP = 2, HT = 28;
  var per = Math.ceil(ZONES.length / 2);
  var WT  = Math.max(24, per * BW + (per - 1) * GAP + 12);

  var G_GRASS = 0, G_PATH = 1, G_SOLID = 2;
  var kind = new Uint8Array(WT * HT);
  function at(x, y) { return (x < 0 || y < 0 || x >= WT || y >= HT) ? G_SOLID : kind[y * WT + x]; }
  function put(x, y, v) { if (x >= 0 && y >= 0 && x < WT && y < HT) kind[y * WT + x] = v; }

  function slotOf(i) {
    var k = i % per;
    return { bx: 6 + k * (BW + GAP), by: (i < per) ? 4 : 16 };
  }
  for (var i = 0; i < ZONES.length; i++) {
    var s = slotOf(i);
    ZONES[i].bx = s.bx; ZONES[i].by = s.by;
    ZONES[i].dx = s.bx + 3; ZONES[i].dy = s.by + BH - 1;   /* tile de la puerta */
    ZONES[i].fx = s.bx + 3; ZONES[i].fy = s.by + BH;       /* tile de enfrente  */
  }

  /* caminos: dos avenidas horizontales + verticales a los costados + callejones */
  function road(x0, y0, x1, y1) {
    for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++) put(x, y, G_PATH);
  }
  road(3, 10, WT - 4, 11);
  road(3, 22, WT - 4, 23);
  road(3, 10, 4, 23);
  road(WT - 5, 10, WT - 4, 23);
  for (var k = 0; k < per - 1; k++) {
    var ax = 6 + k * (BW + GAP) + BW;
    road(ax, 10, ax, 23);
  }

  /* edificios y bosque del borde: sólidos */
  for (var z = 0; z < ZONES.length; z++) {
    for (var by = 0; by < BH; by++) for (var bx = 0; bx < BW; bx++) put(ZONES[z].bx + bx, ZONES[z].by + by, G_SOLID);
  }
  for (var y2 = 0; y2 < HT; y2++) for (var x2 = 0; x2 < WT; x2++) {
    if (x2 < 2 || x2 > WT - 3 || y2 < 2 || y2 > HT - 3) put(x2, y2, G_SOLID);
  }

  /* fuente en la plaza central, esquivando callejones */
  var fnt = null;
  for (var off = 0; off < WT && !fnt; off++) {
    for (var sgn = -1; sgn <= 1 && !fnt; sgn += 2) {
      var fx = (WT >> 1) + sgn * off;
      if (at(fx, 13) === G_GRASS && at(fx + 1, 13) === G_GRASS && at(fx, 14) === G_GRASS && at(fx + 1, 14) === G_GRASS) {
        fnt = { x: fx, y: 13 };
        put(fx, 13, G_SOLID); put(fx + 1, 13, G_SOLID); put(fx, 14, G_SOLID); put(fx + 1, 14, G_SOLID);
      }
    }
  }

  /* arbolado suelto en las franjas de pasto: da profundidad y marca los bordes */
  var decor = [];
  (function plantar() {
    var r0 = rng(77341), bandas = [2, 3, HT - 4, HT - 3];
    for (var i = 0; i < bandas.length; i++) {
      var y = bandas[i];
      for (var x = 3; x < WT - 3; x++) {
        if (at(x, y) !== G_GRASS) continue;
        var d = r0();
        if (d < 0.16) { decor.push({ x: x, y: y, t: 0 }); put(x, y, G_SOLID); }
        else if (d < 0.26) { decor.push({ x: x, y: y, t: 1 }); put(x, y, G_SOLID); }
      }
    }
  })();

  /* ═══════════ pintado del mundo (una sola vez) ═══════════ */
  var world = document.createElement('canvas');
  world.width = WT * TS; world.height = HT * TS;
  var wg = world.getContext('2d');
  var R = rng(20260820);

  function tGrass(g, ox, oy, r) {
    px(g, ox, oy, TS, TS, C.grass);
    for (var a = 0; a < 3; a++) px(g, ox + (r() * 15 | 0), oy + (r() * 15 | 0), 2, 1, C.grass2);
    for (var b = 0; b < 2; b++) px(g, ox + (r() * 15 | 0), oy + (r() * 14 | 0), 1, 2, C.grass3);
  }
  function tFlower(g, ox, oy, r) {
    var cols = [['#FF6BA9','#FFB3D4'], [C.zest,'#FFE47A'], ['#FFF8F2','#FFFFFF'], ['#C77DFF','#E2B8FF']];
    var c2 = cols[(r() * cols.length) | 0];
    var a = 3 + (r() * 10 | 0), b = 4 + (r() * 8 | 0);
    px(g, ox + a, oy + b + 2, 1, 3, C.leaf3);
    px(g, ox + a - 1, oy + b + 3, 1, 1, C.leaf2);
    px(g, ox + a - 1, oy + b, 3, 2, C.leaf3);
    px(g, ox + a - 1, oy + b, 3, 2, c2[0]);
    px(g, ox + a - 1, oy + b, 1, 1, c2[1]);
  }
  function tTuft(g, ox, oy, r) {
    var a = 2 + (r() * 11 | 0), b = 6 + (r() * 7 | 0);
    px(g, ox + a, oy + b, 1, 4, C.leaf3);
    px(g, ox + a + 2, oy + b + 1, 1, 3, C.grass3);
    px(g, ox + a - 2, oy + b + 2, 1, 2, C.grass3);
  }
  function tPath(g, ox, oy, x, y, r) {
    px(g, ox, oy, TS, TS, C.path);
    for (var a = 0; a < 5; a++) px(g, ox + (r() * 14 | 0), oy + (r() * 15 | 0), 2, 1, C.path2);
    if (at(x, y - 1) !== G_PATH) px(g, ox, oy, TS, 2, C.path3);
    if (at(x, y + 1) !== G_PATH) px(g, ox, oy + TS - 2, TS, 2, C.path3);
    if (at(x - 1, y) !== G_PATH) px(g, ox, oy, 2, TS, C.path3);
    if (at(x + 1, y) !== G_PATH) px(g, ox + TS - 2, oy, 2, TS, C.path3);
  }
  /* copas por filas de ancho variable: se redondean en vez de verse cuadradas */
  var CANOPY = [[5, 6], [3, 10], [2, 12], [2, 12], [2, 12], [3, 10], [4, 8]];
  var BUSHY  = [[5, 6], [3, 10], [3, 10], [4, 8]];
  function copa(g, x, y, rows, tono) {
    var i, c;
    for (i = 0; i < rows.length; i++) { c = rows[i]; px(g, x + c[0] - 1, y + i, c[1] + 2, 1, C.ink); }
    px(g, x + rows[0][0], y - 1, rows[0][1], 1, C.ink);
    px(g, x + rows[rows.length - 1][0], y + rows.length, rows[rows.length - 1][1], 1, C.ink);
    for (i = 0; i < rows.length; i++) {
      c = rows[i];
      px(g, x + c[0], y + i, c[1], 1, i === 0 ? tono[0] : (i >= rows.length - 2 ? tono[2] : tono[1]));
    }
    px(g, x + rows[0][0], y + 1, 3, 1, tono[0]);
    px(g, x + rows[0][0] - 1, y + 2, 2, 1, tono[0]);
  }
  var TONOS = [['#5BB84C', C.leaf, C.leaf3], ['#4FA83E', '#2F7A2C', '#1D5420'], ['#63C455', '#3F9438', C.leaf3]];
  function tTree(g, ox, oy, r) {
    var x = ox + ((r() * 5) | 0) - 2, y = oy + ((r() * 3) | 0) - 1;
    px(g, x + 4, y + 13, 9, 3, 'rgba(0,0,0,.22)');
    px(g, x + 6, y + 9, 4, 6, C.ink);
    px(g, x + 7, y + 10, 2, 4, C.wood);
    copa(g, x, y, CANOPY, TONOS[(r() * TONOS.length) | 0]);
  }
  function tBush(g, ox, oy, r) {
    var x = ox + ((r() * 5) | 0) - 2, y = oy + 5 + ((r() * 3) | 0) - 1;
    px(g, x + 4, y + 9, 9, 2, 'rgba(0,0,0,.18)');
    copa(g, x, y, BUSHY, TONOS[(r() * TONOS.length) | 0]);
  }
  function drawFountain(g, ox, oy) {
    px(g, ox, oy, 32, 32, C.ink);
    px(g, ox + 2, oy + 2, 28, 28, C.stone);
    px(g, ox + 5, oy + 5, 22, 22, C.ink);
    px(g, ox + 6, oy + 6, 20, 20, C.water);
    px(g, ox + 8, oy + 8, 16, 7, C.water2);
    px(g, ox + 14, oy + 3, 4, 13, C.stone);
    px(g, ox + 13, oy + 1, 6, 3, C.ink);
    px(g, ox + 14, oy + 2, 4, 1, C.water2);
  }
  function drawWindow(g, x, y) {
    px(g, x, y, 20, 16, C.ink);
    px(g, x + 2, y + 2, 16, 12, '#2E9BE8');
    px(g, x + 3, y + 3, 6, 5, '#9FDBFA');
    px(g, x + 2, y + 7, 16, 1, C.ink);
    px(g, x + 9, y + 2, 1, 12, C.ink);
  }
  function drawBuilding(g, ox, oy, col) {
    var W = BW * TS, H = BH * TS, RH = 34, dark = shade(col, 0.74), lite = shade(col, 1.18);
    px(g, ox + 6, oy + 10, W, H - 4, 'rgba(0,0,0,.30)');
    px(g, ox, oy + RH, W, H - RH, C.ink);
    px(g, ox + 3, oy + RH + 3, W - 6, H - RH - 6, C.wall);
    px(g, ox + 3, oy + RH + 3, W - 6, 5, C.wall2);
    px(g, ox + 3, oy + H - 8, W - 6, 5, C.wall2);
    px(g, ox - 6, oy, W + 12, RH, C.ink);
    px(g, ox - 3, oy + 3, W + 6, RH - 6, col);
    px(g, ox - 3, oy + 3, W + 6, 3, lite);
    for (var t = 0; t < 3; t++) px(g, ox - 3, oy + 9 + t * 8, W + 6, 2, dark);
    px(g, ox - 6, oy + RH - 4, W + 12, 4, C.ink);
    drawWindow(g, ox + 12, oy + RH + 16);
    drawWindow(g, ox + W - 32, oy + RH + 16);
    px(g, ox + 46, oy + H - 34, 20, 34, C.ink);
    px(g, ox + 48, oy + H - 32, 16, 32, C.wood);
    px(g, ox + 50, oy + H - 30, 12, 26, C.wood2);
    px(g, ox + 60, oy + H - 18, 2, 2, C.zest);
    px(g, ox + 42, oy + H - 4, 28, 4, C.stone);
    px(g, ox + 40, oy + RH + 6, 32, 11, C.ink);
    px(g, ox + 42, oy + RH + 8, 28, 7, col);
    px(g, ox + 44, oy + RH + 9, 24, 2, lite);
    px(g, ox + 13, oy - 13, 3, 16, C.ink);
    px(g, ox + 14, oy - 12, 1, 14, C.stone);
    px(g, ox + 16, oy - 12, 11, 8, C.ink);
    px(g, ox + 17, oy - 11, 9, 6, col);
    px(g, ox + 17, oy - 11, 9, 2, lite);
  }

  (function paint() {
    var r = R;
    for (var y = 0; y < HT; y++) for (var x = 0; x < WT; x++) {
      var ox = x * TS, oy = y * TS, k = at(x, y);
      if (k === G_PATH) { tPath(wg, ox, oy, x, y, r); continue; }
      tGrass(wg, ox, oy, r);
      if (k !== G_GRASS) continue;
      var dado = r();
      if (dado < 0.18) tFlower(wg, ox, oy, r);
      else if (dado < 0.34) tTuft(wg, ox, oy, r);
    }
    /* bosque del borde */
    for (var y3 = 0; y3 < HT; y3++) for (var x3 = 0; x3 < WT; x3++) {
      var borde = (x3 < 2 || x3 > WT - 3 || y3 < 2 || y3 > HT - 3);
      if (!borde) continue;
      if (r() < 0.74) tTree(wg, x3 * TS, y3 * TS, r); else if (r() < 0.55) tBush(wg, x3 * TS, y3 * TS, r);
    }
    for (var d = 0; d < decor.length; d++) {
      var o = decor[d];
      (o.t === 0 ? tTree : tBush)(wg, o.x * TS, o.y * TS, r);
    }
    if (fnt) drawFountain(wg, fnt.x * TS, fnt.y * TS);
    for (var z = 0; z < ZONES.length; z++) drawBuilding(wg, ZONES[z].bx * TS, ZONES[z].by * TS, ZONES[z].color);
  })();

  /* ═══════════ sprites (pixel art propio, 14x20) ═══════════ */
  var SPR = {
    down: [
      '.....KKKK.....','...KKCCCCKK...','..KCCCCCCCCK..','..KCCCCCCCCK..',
      '.KKccccccccKK.','.KHHHHHHHHHHK.','.KHSSSSSSSSHK.','.KSSKSSSSKSSK.',
      '.KsSSSSSSSSsK.','..KSSSSSSSSK..','...KKSSSSKK...','..KTTTTTTTTK..',
      '.KSTTTTTTTTSK.','.KSTTTMMTTTSK.','.KSTTTTTTTTSK.','.KKTTTTTTTTKK.',
      '..KTTTTTTTTK..','..KPPPKKPPPK..','..KPPPKKPPPK..','..KBBBKKBBBK..'
    ],
    up: [
      '.....KKKK.....','...KKCCCCKK...','..KCCCCCCCCK..','..KCCCCCCCCK..',
      '.KKccccccccKK.','.KHHHHHHHHHHK.','.KHHHHHHHHHHK.','.KHHHHHHHHHHK.',
      '.KHHHHHHHHHHK.','..KHHHHHHHHK..','...KKSSSSKK...','..KTTTTTTTTK..',
      '.KSTTTTTTTTSK.','.KSTTTTTTTTSK.','.KSTTTTTTTTSK.','.KKTTTTTTTTKK.',
      '..KTTTTTTTTK..','..KPPPKKPPPK..','..KPPPKKPPPK..','..KBBBKKBBBK..'
    ],
    side: [
      '.....KKKK.....','...KKCCCCKKK..','..KCCCCCCCCCK.','..KCCCCCCCCCK.',
      '.KKccccccccKK.','.KHHHHHHHHHHK.','.KHHSSSSSSSHK.','.KHHSSSKSSSSK.',
      '.KHHSSSSSSSsK.','..KHSSSSSSSK..','...KKSSSSKK...','...KTTTTTTK...',
      '..KSTTTTTTSK..','..KSTTTMMTTSK.','..KSTTTTTTSK..','..KKTTTTTTKK..',
      '...KTTTTTTK...','...KPPPPPPK...','...KPPPPPPK...','...KBBBBBBK...'
    ]
  };
  var BASE_PAL = { K:'#0F0B07', S:'#FFD2A6', s:'#E8AE7C', H:'#2B2218', C:'#FF5E0E', c:'#E84B00',
                   T:'#FFF8F2', t:'#E0D2C6', P:'#2E4A7A', B:'#241B12', M:'#FFC400' };
  var SW = 16, SH = 22, LEG0 = 17;

  function bake(rows, pal, dir, frame) {
    var cn = document.createElement('canvas'); cn.width = SW; cn.height = SH;
    var g = cn.getContext('2d');
    for (var y = 0; y < rows.length; y++) {
      var line = rows[y];
      for (var x = 0; x < line.length; x++) {
        var ch = line.charAt(x);
        if (ch === '.') continue;
        var col = pal[ch] || BASE_PAL[ch]; if (!col) continue;
        var dx = 0, dy = 0;
        if (frame && y >= LEG0) {
          if (dir === 2) dx = (frame === 1) ? (x < 7 ? -1 : 0) : (x < 7 ? 0 : 1);
          else dy = ((frame === 1) === (x < 7)) ? -1 : 0;
        }
        px(g, 1 + x + dx, 1 + y + dy, 1, 1, col);
      }
    }
    return cn;
  }
  function bakeSet(pal) {
    return {
      down: [bake(SPR.down, pal, 0, 0), bake(SPR.down, pal, 0, 1), bake(SPR.down, pal, 0, 2)],
      up:   [bake(SPR.up,   pal, 1, 0), bake(SPR.up,   pal, 1, 1), bake(SPR.up,   pal, 1, 2)],
      side: [bake(SPR.side, pal, 2, 0), bake(SPR.side, pal, 2, 1), bake(SPR.side, pal, 2, 2)]
    };
  }
  var SET_HERO  = bakeSet({});
  var SET_WA    = bakeSet({ C:'#25D366', c:'#128C4A', T:'#0F3D24', M:'#FFF8F2', H:'#1B1B1B' });
  var SET_SHOP  = bakeSet({ C:'#FFC400', c:'#D19A00', T:'#2E9BE8', M:'#FFF8F2', H:'#3B2410' });

  /* la mandarina salvaje: bicho propio, redondo y con hoja */
  var SPR_WILD = [
    '......KGK.....','.....KGGK.....','....KKOOKK....','...KOOOOOOK...',
    '..KOhhOOOOOK..','.KOOOOOOOOOOK.','.KOOKOOOOKOOK.','.KOOKOOOOKOOK.',
    '.KOOOOOOOOOOK.','.KOoOOOOOOoOK.','..KOOOOOOOOK..','...KOOOOOOK...',
    '....KKOOKK....','.....KBBK.....'
  ];
  var IMG_WILD = bake(SPR_WILD, { O:'#FF7A1A', o:'#D14E00', h:'#FFBE7A', G:'#3F9438', B:'#8A5A20' }, 0, 0);

  /* ═══════════ jugador, NPCs, cámara ═══════════ */
  function walkable(x, y) { return at(x, y) !== G_SOLID; }
  /* la salida tiene que estar despejada: si no, la fuente o un arbusto
     dejan al personaje encajonado y parece que el mapa no responde */
  function spawn() {
    var rows = [15, 14, 12, 21, 24, 13, 11];
    for (var i = 0; i < rows.length; i++) {
      for (var d = 0; d < WT; d++) {
        for (var sg = -1; sg <= 1; sg += 2) {
          var x = (WT >> 1) + sg * d, y = rows[i];
          if (x <= 2 || x >= WT - 3) continue;
          if (walkable(x, y) && walkable(x, y - 1) && walkable(x - 1, y) && walkable(x + 1, y)) {
            return { x: x * TS + 8, y: y * TS + 14 };
          }
        }
      }
    }
    return { x: WT * TS / 2, y: HT * TS / 2 };
  }
  var sp = spawn();
  var hero = { x: sp.x, y: sp.y, dir: 'down', flip: false, walk: 0, frame: 0 };
  var cam = { x: 0, y: 0 };

  var npcs = [];
  var WA = ROOT.dataset.wa, MAPA = ROOT.dataset.tienda;
  (function placeNpcs() {
    var band = [15, 14, 24, 12];
    function freeSpot(prefX) {
      for (var i = 0; i < band.length; i++) {
        for (var d = 0; d < 10; d++) {
          for (var sg = -1; sg <= 1; sg += 2) {
            var x = prefX + sg * d;
            if (x > 2 && x < WT - 3 && at(x, band[i]) === G_GRASS) { put(x, band[i], G_SOLID); return { x: x * TS + 8, y: band[i] * TS + 14 }; }
          }
        }
      }
      return null;
    }
    if (WA) { var a = freeSpot(Math.max(6, (WT >> 1) - 5)); if (a) npcs.push({ x: a.x, y: a.y, set: SET_WA, kind: 'wa', dir: 'down' }); }
    if (MAPA) { var b = freeSpot(Math.min(WT - 7, (WT >> 1) + 6)); if (b) npcs.push({ x: b.x, y: b.y, set: SET_SHOP, kind: 'tienda', dir: 'down' }); }
  })();
  /* los NPCs ocupan tile: si a alguno le tocó el de salida, el héroe se corre */
  if (!walkable(Math.floor(hero.x / TS), Math.floor((hero.y - 4) / TS))) {
    var sp2 = spawn(); hero.x = sp2.x; hero.y = sp2.y;
  }

  /* ── mandarina salvaje: anda suelta, huye si te acercas y al
        alcanzarla suelta el código de descuento ── */
  var CODIGO  = ROOT.dataset.promoCode || '';
  var PROMO   = ROOT.dataset.promo === '1' && CODIGO !== '';
  var RESPAWN = Math.max(5, parseInt(ROOT.dataset.promoRespawn, 10) || 20);
  var pill = ROOT.querySelector('.mrmap__promo');
  var wild = null, chispa = 0, chispaX = 0, chispaY = 0, avisoT = null;

  function puntoLibre(lejosDe) {
    for (var i = 0; i < 240; i++) {
      var tx = 3 + ((Math.random() * (WT - 6)) | 0), ty = 3 + ((Math.random() * (HT - 6)) | 0);
      if (!walkable(tx, ty)) continue;
      var wx = tx * TS + 8, wy = ty * TS + 12;
      if (lejosDe && Math.abs(wx - lejosDe.x) < 100 && Math.abs(wy - lejosDe.y) < 100) continue;
      return { x: wx, y: wy };
    }
    return { x: hero.x + 90, y: hero.y };
  }
  function pintarPill(estado) {
    if (!pill || !wild) return;
    pill.hidden = false;
    if (estado === 'atrapada') { pill.textContent = '🎁 ' + CODIGO; pill.className = 'mrmap__promo is-hit'; }
    else if (estado === 'espera') { pill.textContent = ROOT.dataset.promoEspera || ''; pill.className = 'mrmap__promo is-wait'; }
    else { pill.textContent = ROOT.dataset.promoSuelta || ''; pill.className = 'mrmap__promo'; }
    if (!pill.textContent) pill.hidden = true;
  }
  function pasoWild(dt) {
    if (!wild) return;
    if (wild.oculta) {
      wild.vuelve -= dt;
      if (wild.vuelve <= 0) {
        var q = puntoLibre(hero);
        wild.x = q.x; wild.y = q.y; wild.oculta = false; pintarPill('suelta');
      }
      return;
    }
    if (!dlg.hidden) return;                       /* se queda quieta mientras lees */
    var dx = wild.x - hero.x, dy = wild.y - hero.y;
    var d = Math.sqrt(dx * dx + dy * dy) || 1;
    if (d < 13) { atrapar(); return; }
    wild.prox -= dt;
    if (d < 72) {                                  /* huye, pero más lenta que vos */
      wild.vx = dx / d; wild.vy = dy / d; wild.sp = 82; wild.prox = 0.2;
    } else if (wild.prox <= 0) {                   /* si no, pasea */
      var a = Math.random() * 6.2832;
      if (Math.random() < 0.22) { wild.vx = 0; wild.vy = 0; }
      else { wild.vx = Math.cos(a); wild.vy = Math.sin(a); }
      wild.sp = 38; wild.prox = 0.5 + Math.random();
    }
    var nx = wild.x + wild.vx * wild.sp * dt, ny = wild.y + wild.vy * wild.sp * dt;
    if (canBe(nx, wild.y)) wild.x = nx; else { wild.vx = -wild.vx; wild.prox = 0.35; }
    if (canBe(wild.x, ny)) wild.y = ny; else { wild.vy = -wild.vy; wild.prox = 0.35; }
    wild.t += dt;
    wild.frame = (wild.vx || wild.vy) ? (((wild.t * 7) | 0) % 2) : 0;
  }
  function atrapar() {
    wild.oculta = true; wild.vuelve = RESPAWN;
    chispa = 0.8; chispaX = wild.x; chispaY = wild.y;
    pintarPill('atrapada');
    if (avisoT) clearTimeout(avisoT);
    avisoT = setTimeout(function () { if (wild && wild.oculta) pintarPill('espera'); }, 2600);
    show({
      color: '#FFC400', eyebrow: 'Mandarina salvaje',
      title: ROOT.dataset.promoTitle || '¡La atrapaste!',
      text: ROOT.dataset.promoText || '',
      items: [], code: CODIGO,
      href: ROOT.dataset.promoUrl || '/collections/all',
      cta: ROOT.dataset.promoCta || 'Usar el descuento'
    });
  }

  var HB_W = 10, HB_H = 7;
  function canBe(cx, cy) {
    var x0 = Math.floor((cx - HB_W / 2) / TS), x1 = Math.floor((cx + HB_W / 2 - 1) / TS);
    var y0 = Math.floor((cy - HB_H) / TS),     y1 = Math.floor((cy - 1) / TS);
    for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++) if (!walkable(x, y)) return false;
    return true;
  }

  /* ═══════════ etiquetas HTML sobre los edificios ═══════════ */
  var tags = ZONES.map(function (z, i) {
    var a = document.createElement('a');
    a.className = 'mrmap__tag';
    a.href = z.url; a.textContent = z.name;
    a.style.setProperty('--tagc', z.color);
    a.dataset.zona = i;
    tagBox.appendChild(a);
    return a;
  });

  /* ═══════════ diálogo ═══════════ */
  var dEye = dlg.querySelector('.mrmap__dlgeye'), dTit = dlg.querySelector('.mrmap__dlgt');
  var dTxt = dlg.querySelector('.mrmap__dlgp'), dThm = dlg.querySelector('.mrmap__thumbs');
  var dCta = dlg.querySelector('.mrmap__cta');
  var dCode = dlg.querySelector('.mrmap__code');
  var dCodeB = dCode.querySelector('b'), dCopy = dlg.querySelector('.mrmap__copy');
  var typer = null, openIdx = -1;

  function type(el, text) {
    if (typer) { clearTimeout(typer); typer = null; }
    if (REDUCE) { el.textContent = text; return; }
    el.textContent = ''; var i = 0;
    (function step() {
      el.textContent = text.slice(0, ++i);
      if (i < text.length) typer = setTimeout(step, 16);
    })();
  }
  function show(o) {
    dlg.style.setProperty('--accent', o.color);
    dlg.style.borderColor = o.color;
    dEye.textContent = o.eyebrow || '';
    dEye.style.color = o.color;
    dTit.textContent = o.title;
    type(dTxt, o.text || '');
    dThm.innerHTML = '';
    (o.items || []).forEach(function (p) {
      if (!p.i) return;
      var a = document.createElement('a');
      a.href = p.u; a.title = p.t;
      a.innerHTML = '<img src="' + p.i + '" alt="" loading="lazy" decoding="async"><b>' + p.p + '</b>';
      dThm.appendChild(a);
    });
    dThm.style.display = dThm.children.length ? '' : 'none';
    if (o.code) {
      dCodeB.textContent = o.code; dCode.hidden = false;
      dCopy.textContent = 'Copiar'; dCopy.className = 'mrmap__copy';
    } else dCode.hidden = true;
    dCta.href = o.href; dCta.textContent = o.cta;
    dCta.style.background = o.color;
    dlg.hidden = false;
    dlg.querySelector('.mrmap__x').focus({ preventScroll: true });
  }
  function openZone(i) {
    var z = ZONES[i]; if (!z) return;
    openIdx = i;
    show({
      color: z.color, eyebrow: z.eyebrow || 'Universo',
      title: z.name, text: z.text || '',
      items: z.items, href: z.url,
      cta: z.count ? ('Ver los ' + z.count + ' diseños →') : 'Ver colección →'
    });
    rail.querySelectorAll('.mrmap__chip').forEach(function (c) { c.classList.toggle('is-on', c.dataset.zona == i); });
  }
  function openNpc(kind) {
    openIdx = -1;
    if (kind === 'wa') {
      show({
        color: '#25D366', eyebrow: 'Taller · diseño a pedido',
        title: '¿No ves tu personaje?',
        text: 'Mándanos la idea y la volvemos prenda. Cualquier personaje, cualquier talla, cualquier color.',
        items: [], href: 'https://wa.me/' + WA + '?text=' + (ROOT.dataset.watext || ''),
        cta: 'Escribir por WhatsApp →'
      });
    } else {
      show({
        color: '#FF5E0E', eyebrow: 'Tienda física',
        title: ROOT.dataset.tiendaNombre || 'Visítanos',
        text: ROOT.dataset.tiendaTxt || '',
        items: [], href: MAPA, cta: 'Cómo llegar →'
      });
    }
  }
  function closeDlg() {
    var estaba = !dlg.hidden;
    dlg.hidden = true; openIdx = -1;
    if (typer) { clearTimeout(typer); typer = null; }
    rail.querySelectorAll('.mrmap__chip').forEach(function (c) { c.classList.remove('is-on'); });
    /* el foco vuelve al mapa: si no, el teclado queda en la nada al cerrar */
    if (estaba) stage.focus({ preventScroll: true });
  }
  dlg.querySelector('.mrmap__x').addEventListener('click', closeDlg);
  dCopy.addEventListener('click', function () {
    var txt = dCodeB.textContent;
    function ok() { dCopy.textContent = '¡Copiado!'; dCopy.className = 'mrmap__copy is-ok'; }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt).then(ok, function () {});
      return;
    }
    var ta = document.createElement('textarea');
    ta.value = txt; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); ok(); } catch (e) {}
    document.body.removeChild(ta);
  });
  /* con el foco dentro del diálogo, Escape tiene que seguir cerrando */
  dlg.addEventListener('keydown', function (e) { if (e.key === 'Escape') { e.stopPropagation(); closeDlg(); } });

  /* ═══════════ controles ═══════════ */
  var keys = { u:false, d:false, l:false, r:false };
  var moved = false, T = 0;

  function act() {
    if (!dlg.hidden) { closeDlg(); return; }
    var n = near();
    if (n) { n.type === 'z' ? openZone(n.i) : openNpc(npcs[n.i].kind); }
  }
  var KEYMAP = { ArrowUp:'u', ArrowDown:'d', ArrowLeft:'l', ArrowRight:'r', w:'u', s:'d', a:'l', d:'r', W:'u', S:'d', A:'l', D:'r' };
  stage.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { closeDlg(); return; }
    if (e.key === 'e' || e.key === 'E' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); act(); return; }
    var k = KEYMAP[e.key]; if (!k) return;
    e.preventDefault(); keys[k] = true; hideHint();
  });
  stage.addEventListener('keyup', function (e) { var k = KEYMAP[e.key]; if (k) keys[k] = false; });
  stage.addEventListener('blur', function () { keys.u = keys.d = keys.l = keys.r = false; });

  ROOT.querySelectorAll('.mrmap__d').forEach(function (b) {
    var k = b.dataset.dir;
    function on(e) { e.preventDefault(); keys[k] = true; hideHint(); if (b.setPointerCapture && e.pointerId != null) { try { b.setPointerCapture(e.pointerId); } catch (err) {} } }
    function off() { keys[k] = false; }
    b.addEventListener('pointerdown', on);
    b.addEventListener('pointerup', off);
    b.addEventListener('pointercancel', off);
    b.addEventListener('pointerleave', off);
  });
  ROOT.querySelector('.mrmap__a').addEventListener('click', function (e) { e.preventDefault(); act(); });

  function hideHint() { if (hint && !moved) { moved = true; hint.classList.add('is-off'); } }

  /* tocar el mapa: enfoca, y si tocaste un edificio lo abre */
  stage.addEventListener('pointerdown', function (e) {
    if (e.target.closest('.mrmap__dlg') || e.target.closest('.mrmap__pad') || e.target.closest('.mrmap__tag')) return;
    stage.focus({ preventScroll: true });
    var r = cv.getBoundingClientRect();
    var wx = cam.x + (e.clientX - r.left) / r.width * cv.width;
    var wy = cam.y + (e.clientY - r.top) / r.height * cv.height;
    var tx = Math.floor(wx / TS), ty = Math.floor(wy / TS);
    for (var i = 0; i < ZONES.length; i++) {
      var z = ZONES[i];
      if (tx >= z.bx && tx < z.bx + BW && ty >= z.by - 1 && ty < z.by + BH) { goTo(i); return; }
    }
    for (var n = 0; n < npcs.length; n++) {
      if (Math.abs(wx - npcs[n].x) < 14 && Math.abs(wy - npcs[n].y + 10) < 18) { openNpc(npcs[n].kind); return; }
    }
    if (!dlg.hidden) closeDlg();
  });

  tagBox.addEventListener('click', function (e) {
    var a = e.target.closest('.mrmap__tag'); if (!a) return;
    e.preventDefault(); goTo(+a.dataset.zona);
  });
  rail.addEventListener('click', function (e) {
    var a = e.target.closest('.mrmap__chip'); if (!a || a.dataset.zona === undefined) return;
    e.preventDefault(); goTo(+a.dataset.zona);
    stage.scrollIntoView({ block: 'nearest', behavior: REDUCE ? 'auto' : 'smooth' });
  });

  /* viaje rápido: el personaje aparece frente a la puerta y entra */
  function goTo(i) {
    var z = ZONES[i]; if (!z) return;
    hero.x = z.fx * TS + 8; hero.y = z.fy * TS + 14;
    hero.dir = 'up'; hero.frame = 0; hero.walk = 0;
    hideHint(); openZone(i); start();
    stage.focus({ preventScroll: true });
  }

  /* ═══════════ interacción cercana ═══════════ */
  function near() {
    var ptx = Math.floor(hero.x / TS), pty = Math.floor((hero.y - 4) / TS), best = null;
    for (var i = 0; i < ZONES.length; i++) {
      var z = ZONES[i];
      if (pty === z.fy && Math.abs(ptx - z.fx) <= 1) best = { type:'z', i:i, x:z.dx * TS + 8, y:z.dy * TS + 4 };
    }
    if (best) return best;
    for (var n = 0; n < npcs.length; n++) {
      var p = npcs[n];
      if (Math.abs(hero.x - p.x) < 22 && Math.abs(hero.y - p.y) < 22) return { type:'n', i:n, x:p.x, y:p.y - 20 };
    }
    return null;
  }

  /* ═══════════ paso de simulación ═══════════ */
  var SPEED = 96;
  function step(dt) {
    var vx = 0, vy = 0;
    if (dlg.hidden) {
      if (keys.l) vx -= 1; if (keys.r) vx += 1;
      if (keys.u) vy -= 1; if (keys.d) vy += 1;
    }
    if (vx && vy) { vx *= 0.7071; vy *= 0.7071; }
    if (vx || vy) {
      if (vx) { hero.dir = 'side'; hero.flip = vx < 0; }
      else hero.dir = vy < 0 ? 'up' : 'down';
      var nx = hero.x + vx * SPEED * dt, ny = hero.y + vy * SPEED * dt;
      if (canBe(nx, hero.y)) hero.x = nx;
      if (canBe(hero.x, ny)) hero.y = ny;
      hero.walk += Math.abs(vx * SPEED * dt) + Math.abs(vy * SPEED * dt);
      hero.frame = [0, 1, 0, 2][Math.floor(hero.walk / 7) % 4];
    } else {
      hero.frame = 0; hero.walk = 0;
    }
    hero.x = Math.max(TS, Math.min(WT * TS - TS, hero.x));
    hero.y = Math.max(TS, Math.min(HT * TS - 4, hero.y));
    if (chispa > 0) chispa -= dt;
    pasoWild(dt);
  }

  /* ═══════════ dibujo ═══════════ */
  function actor(a, img, flip, anclaje) {
    var an = anclaje || 21;
    var sx = Math.round(a.x - cam.x - SW / 2), sy = Math.round(a.y - cam.y - an);
    px(ctx, sx + 3, Math.round(a.y - cam.y - 3), 10, 3, 'rgba(0,0,0,.22)');
    if (flip) { ctx.save(); ctx.translate(sx + SW, sy); ctx.scale(-1, 1); ctx.drawImage(img, 0, 0); ctx.restore(); }
    else ctx.drawImage(img, sx, sy);
  }
  function draw() {
    var VW = cv.width, VH = cv.height;
    cam.x = Math.max(0, Math.min(WT * TS - VW, Math.round(hero.x - VW / 2)));
    cam.y = Math.max(0, Math.min(HT * TS - VH, Math.round(hero.y - VH / 2 - 10)));
    ctx.drawImage(world, cam.x, cam.y, VW, VH, 0, 0, VW, VH);

    if (fnt && !REDUCE) {
      var fx = fnt.x * TS - cam.x, fy = fnt.y * TS - cam.y, w = (T / 260 | 0) % 3;
      px(ctx, fx + 9, fy + 11 + w, 5, 1, C.water2);
      px(ctx, fx + 19, fy + 20 - w, 4, 1, C.water2);
      px(ctx, fx + 14, fy + 4 + w, 1, 2, '#BFE9FF');
    }

    var cast = npcs.map(function (n) { return { a: n, img: n.set.down[0], flip: false, an: 21 }; });
    cast.push({ a: hero, img: SET_HERO[hero.dir][hero.frame], flip: hero.flip, an: 21 });
    if (wild && !wild.oculta) cast.push({ a: wild, img: IMG_WILD, flip: wild.vx < 0, an: 15 + (wild.frame ? 1 : 0) });
    cast.sort(function (p, q) { return p.a.y - q.a.y; });
    cast.forEach(function (c) { actor(c.a, c.img, c.flip, c.an); });

    /* chispas al atraparla */
    if (chispa > 0) {
      var rad = (1 - Math.max(0, chispa) / 0.8) * 24;
      var kx = Math.round(chispaX - cam.x), ky = Math.round(chispaY - cam.y - 8);
      for (var s = 0; s < 8; s++) {
        var ang = s * 0.7854;
        px(ctx, kx + Math.round(Math.cos(ang) * rad), ky + Math.round(Math.sin(ang) * rad), 2, 2, s % 2 ? C.zest : '#FFF8F2');
      }
    }

    var n = dlg.hidden ? near() : null;
    if (n) {
      var bob = REDUCE ? 0 : ((T / 300 | 0) % 2);
      var bx = Math.round(n.x - cam.x), by = Math.round(n.y - cam.y - 16 - bob);
      px(ctx, bx - 7, by - 1, 14, 14, C.ink);
      px(ctx, bx - 6, by, 12, 12, '#FFF8F2');
      px(ctx, bx - 1, by + 2, 2, 5, C.ink);
      px(ctx, bx - 1, by + 8, 2, 2, C.ink);
    }

    /* etiquetas de los edificios, en coordenadas de pantalla */
    var rect = cv.getBoundingClientRect(), k = rect.width / VW;
    for (var i = 0; i < tags.length; i++) {
      var z = ZONES[i];
      var sx = (z.bx * TS + BW * TS / 2 - cam.x) * k;
      var sy = (z.by * TS - 2 - cam.y) * k;
      var vis = sx > -80 && sx < rect.width + 80 && sy > -40 && sy < rect.height + 40;
      tags[i].style.display = vis ? '' : 'none';
      if (vis) tags[i].style.transform = 'translate3d(' + Math.round(sx) + 'px,' + Math.round(sy) + 'px,0) translate(-50%,-100%)';
      tags[i].classList.toggle('is-near', !!(n && n.type === 'z' && n.i === i));
    }
  }

  /* ═══════════ bucle ═══════════ */
  var running = false, last = 0, muerto = false, io = null, ro = null;
  function onVis() { document.hidden ? stop() : start(); }
  function tick(now) {
    if (!running || muerto) return;
    T = now;
    var dt = Math.min(0.05, (now - last) / 1000); last = now;
    step(dt); draw();
    requestAnimationFrame(tick);
  }
  function start() { if (running || muerto) return; running = true; last = performance.now(); requestAnimationFrame(tick); }
  function stop() { running = false; }

  /* el zoom se elige para que un píxel del mundo mida ~2.4 px en pantalla:
     de cerca en el móvil, panorámico en el escritorio. */
  function resize() {
    if (muerto) return;
    var r = stage.getBoundingClientRect();
    if (!r.width) return;
    var w = Math.round(r.width / 2.4);
    w = Math.max(256, Math.min(512, w)); if (w % 2) w++;
    var h = Math.round(w * r.height / r.width);
    h = Math.max(160, Math.min(360, h)); if (h % 2) h++;
    if (cv.width !== w || cv.height !== h) {
      cv.width = w; cv.height = h;
      ctx.imageSmoothingEnabled = false;
    }
    draw();
  }
  if (PROMO) {
    var p0 = puntoLibre(hero);
    wild = { x: p0.x, y: p0.y, vx: 1, vy: 0, sp: 38, prox: 0, t: 0, frame: 0, oculta: false, vuelve: 0 };
    pintarPill('suelta');
  }

  ctx.imageSmoothingEnabled = false;
  addEventListener('resize', resize, { passive: true });
  if (window.ResizeObserver) { ro = new ResizeObserver(resize); ro.observe(stage); }
  resize();

  if (window.IntersectionObserver) {
    io = new IntersectionObserver(function (es) {
      es[0].isIntersecting ? start() : stop();
    }, { threshold: 0.05 });
    io.observe(stage);
  } else start();
  document.addEventListener('visibilitychange', onVis);

  /* el editor de temas monta y desmonta secciones en vivo: si no soltamos
     el bucle y los listeners, quedan mapas fantasma consumiendo frames */
  ROOT.mrmapDestruir = function () {
    muerto = true; stop();
    if (avisoT) clearTimeout(avisoT);
    if (io) io.disconnect();
    if (ro) ro.disconnect();
    removeEventListener('resize', resize);
    document.removeEventListener('visibilitychange', onVis);
  };
  }

  function arrancar(scope) {
    var n = scope || document;
    if (n.matches && n.matches('.mrmap-sec')) { init(n); return; }
    var l = n.querySelectorAll ? n.querySelectorAll('.mrmap-sec') : [];
    for (var i = 0; i < l.length; i++) init(l[i]);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { arrancar(); });
  else arrancar();
  document.addEventListener('shopify:section:load', function (e) { arrancar(e.target); });
  document.addEventListener('shopify:section:unload', function (e) {
    var l = e.target.querySelectorAll ? e.target.querySelectorAll('.mrmap-sec') : [];
    for (var i = 0; i < l.length; i++) if (l[i].mrmapDestruir) l[i].mrmapDestruir();
    if (e.target.mrmapDestruir) e.target.mrmapDestruir();
  });
})();
