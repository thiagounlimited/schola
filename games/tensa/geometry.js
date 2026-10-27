// Geometria pura do Tensa — usada pelo jogo e pelo validador de fases (Node).
export const TAU = Math.PI * 2;

// Posição de um pino/semente no instante t (coordenadas normalizadas 0–1).
export function motionAt(x0, y0, m, t) {
  if (!m) return [x0, y0];
  const ph = (m.phase || 0) + (TAU * t) / m.period;
  switch (m.type) {
    case 'slide': {
      const s = Math.sin(ph);
      return [x0 + (m.dx || 0) * s, y0 + (m.dy || 0) * s];
    }
    case 'orbit':
      return [x0 + m.r * Math.cos(ph), y0 + m.r * Math.sin(ph)];
    case 'spin': {
      const a = Math.atan2(y0 - m.cy, x0 - m.cx) + ph - (m.phase || 0);
      const r = Math.hypot(x0 - m.cx, y0 - m.cy);
      return [m.cx + r * Math.cos(a), m.cy + r * Math.sin(a)];
    }
    default:
      return [x0, y0];
  }
}

export function pointInPoly(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function polyArea(pts) {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1];
  return a / 2;
}

const cross = (ax, ay, bx, by) => ax * by - ay * bx;

function orient(p, q, r) {
  const v = cross(q[0] - p[0], q[1] - p[1], r[0] - p[0], r[1] - p[1]);
  return Math.abs(v) < 1e-9 ? 0 : Math.sign(v);
}

function onSeg(p, q, r) {
  return Math.min(p[0], r[0]) - 1e-9 <= q[0] && q[0] <= Math.max(p[0], r[0]) + 1e-9 &&
    Math.min(p[1], r[1]) - 1e-9 <= q[1] && q[1] <= Math.max(p[1], r[1]) + 1e-9;
}

// Interseção de segmentos incluindo toques e sobreposições colineares.
export function segmentsTouch(a, b, c, d) {
  const o1 = orient(a, b, c), o2 = orient(a, b, d), o3 = orient(c, d, a), o4 = orient(c, d, b);
  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSeg(a, c, b)) return true;
  if (o2 === 0 && onSeg(a, d, b)) return true;
  if (o3 === 0 && onSeg(c, a, d)) return true;
  if (o4 === 0 && onSeg(c, b, d)) return true;
  return false;
}

export function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy || 1e-12;
  const s = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2));
  return { d: Math.hypot(px - (ax + s * dx), py - (ay + s * dy)), s };
}

// Um elástico fechado (3+ pinos) precisa formar um polígono simples, sem dobras nem cruzamentos.
export function isSimplePoly(pts) {
  const n = pts.length;
  if (n < 3) return true;
  if (Math.abs(polyArea(pts)) < 1e-5) return false;
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n], c = pts[(i + 2) % n];
    // dobra: arestas consecutivas voltando sobre si mesmas
    if (orient(a, b, c) === 0 && (b[0] - a[0]) * (c[0] - b[0]) + (b[1] - a[1]) * (c[1] - b[1]) < 0) return false;
  }
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (j === i + 1 || (i === 0 && j === n - 1)) continue; // arestas vizinhas
      if (segmentsTouch(pts[i], pts[(i + 1) % n], pts[j], pts[(j + 1) % n])) return false;
    }
  }
  return true;
}

// Estado das sementes dado um conjunto de polígonos.
// cor >= 0 → precisa estar dentro de ao menos um elástico, e todos que a envolvem devem ser "puros"
// (só uma cor, sem espinhos). Espinho (cor -1) → não pode estar dentro de nenhum elástico.
export function evaluate(seeds, polys) {
  const inside = polys.map((poly) => (poly.length < 3 ? [] : seeds.filter((s) => pointInPoly(s.x, s.y, poly))));
  const bandInfo = inside.map((list) => {
    const colors = new Set(list.map((s) => s.c));
    const pure = !colors.has(-1) && colors.size <= 1;
    return { list, pure, tone: pure && colors.size === 1 ? [...colors][0] : null, mixed: !pure, colors: [...colors] };
  });
  const seedInfo = seeds.map((s) => {
    const holders = bandInfo.filter((b) => b.list.includes(s));
    const happy = s.c >= 0 ? holders.length > 0 && holders.every((b) => b.pure) : holders.length === 0;
    return { happy, enclosed: holders.length > 0 };
  });
  return { bandInfo, seedInfo, allHappy: seeds.length > 0 && seedInfo.every((s) => s.happy) };
}
