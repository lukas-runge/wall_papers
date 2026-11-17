/** SVG path data → subpaths of cubic Bézier segments (absolute coordinates). */

export type Pt = [number, number];
export interface Cubic {
  p0: Pt;
  c1: Pt;
  c2: Pt;
  p1: Pt;
  /** Straight segment (controls on the end points). */
  line: boolean;
}
export interface Subpath {
  segments: Cubic[];
  closed: boolean;
  start: Pt;
}

const line = (a: Pt, b: Pt): Cubic => ({ p0: a, c1: a, c2: b, p1: b, line: true });

/** Elliptical arc as cubic segments (SVG implementation notes, F.6). */
function arcToCubics(p0: Pt, rx: number, ry: number, phiDeg: number, large: boolean, sweep: boolean, p1: Pt): Cubic[] {
  if (rx === 0 || ry === 0) return [line(p0, p1)];
  const phi = (phiDeg * Math.PI) / 180, cos = Math.cos(phi), sin = Math.sin(phi);
  const dx = (p0[0] - p1[0]) / 2, dy = (p0[1] - p1[1]) / 2;
  const x1 = cos * dx + sin * dy, y1 = -sin * dx + cos * dy;
  rx = Math.abs(rx);
  ry = Math.abs(ry);
  const lambda = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
  if (lambda > 1) {
    rx *= Math.sqrt(lambda);
    ry *= Math.sqrt(lambda);
  }
  const num = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
  const den = rx * rx * y1 * y1 + ry * ry * x1 * x1;
  const coef = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, num / den));
  const cx1 = (coef * rx * y1) / ry, cy1 = (-coef * ry * x1) / rx;
  const cx = cos * cx1 - sin * cy1 + (p0[0] + p1[0]) / 2, cy = sin * cx1 + cos * cy1 + (p0[1] + p1[1]) / 2;
  const ang = (ux: number, uy: number, vx: number, vy: number) => {
    const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
    return a;
  };
  const t1 = ang(1, 0, (x1 - cx1) / rx, (y1 - cy1) / ry);
  let dt = ang((x1 - cx1) / rx, (y1 - cy1) / ry, (-x1 - cx1) / rx, (-y1 - cy1) / ry);
  if (!sweep && dt > 0) dt -= 2 * Math.PI;
  if (sweep && dt < 0) dt += 2 * Math.PI;
  const n = Math.max(1, Math.ceil(Math.abs(dt) / (Math.PI / 2)));
  const step = dt / n, k = (4 / 3) * Math.tan(step / 4);
  const point = (t: number): Pt => [cx + rx * Math.cos(t) * cos - ry * Math.sin(t) * sin, cy + rx * Math.cos(t) * sin + ry * Math.sin(t) * cos];
  const deriv = (t: number): Pt => [-rx * Math.sin(t) * cos - ry * Math.cos(t) * sin, -rx * Math.sin(t) * sin + ry * Math.cos(t) * cos];
  const out: Cubic[] = [];
  let a = t1, pa = p0;
  for (let i = 0; i < n; i++) {
    const b = a + step;
    const pb = i === n - 1 ? p1 : point(b);
    const da = deriv(a), db = deriv(b);
    out.push({ p0: pa, c1: [pa[0] + k * da[0], pa[1] + k * da[1]], c2: [pb[0] - k * db[0], pb[1] - k * db[1]], p1: pb, line: false });
    a = b;
    pa = pb;
  }
  return out;
}

export function parsePath(d: string): Subpath[] {
  const toks = d.match(/[MmLlHhVvCcSsQqTtAaZz]|-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) ?? [];
  const subs: Subpath[] = [];
  let i = 0, cmd = "", cur: Pt = [0, 0], start: Pt = [0, 0];
  let lastC: Pt | null = null, lastQ: Pt | null = null;
  // Set inside begin(); the cast stops TypeScript from narrowing it to null.
  let sub = null as Subpath | null;
  const num = () => Number(toks[i++]);
  const flag = () => {
    // Arc flags may be written without separators ("a1 1 0 01 5 5").
    const t = toks[i];
    if (t.length > 1 && /^[01]/.test(t) && !t.includes(".")) {
      toks[i] = t.slice(1);
      return t[0] === "1";
    }
    i++;
    return t === "1";
  };
  const begin = (p: Pt) => {
    sub = { segments: [], closed: false, start: p };
    subs.push(sub);
  };
  while (i < toks.length) {
    if (/^[A-Za-z]$/.test(toks[i])) cmd = toks[i++];
    const rel = cmd === cmd.toLowerCase();
    const at = (x: number, y: number): Pt => (rel ? [cur[0] + x, cur[1] + y] : [x, y]);
    const C = cmd.toUpperCase();
    if (C === "Z") {
      if (sub) {
        sub.closed = true;
        if (cur[0] !== start[0] || cur[1] !== start[1]) sub.segments.push(line(cur, start));
      }
      cur = start;
      sub = null;
      lastC = lastQ = null;
      continue;
    }
    if (C === "M") {
      cur = start = at(num(), num());
      begin(cur);
      cmd = rel ? "l" : "L";
      lastC = lastQ = null;
      continue;
    }
    if (!sub) begin(cur);
    const s = sub!;
    if (C === "L") {
      const p = at(num(), num());
      s.segments.push(line(cur, p));
      cur = p;
      lastC = lastQ = null;
    } else if (C === "H") {
      const x = num();
      const p: Pt = [rel ? cur[0] + x : x, cur[1]];
      s.segments.push(line(cur, p));
      cur = p;
      lastC = lastQ = null;
    } else if (C === "V") {
      const y = num();
      const p: Pt = [cur[0], rel ? cur[1] + y : y];
      s.segments.push(line(cur, p));
      cur = p;
      lastC = lastQ = null;
    } else if (C === "C") {
      const c1 = at(num(), num()), c2 = at(num(), num()), p = at(num(), num());
      s.segments.push({ p0: cur, c1, c2, p1: p, line: false });
      cur = p;
      lastC = c2;
      lastQ = null;
    } else if (C === "S") {
      const c1: Pt = lastC ? [2 * cur[0] - lastC[0], 2 * cur[1] - lastC[1]] : cur;
      const c2 = at(num(), num()), p = at(num(), num());
      s.segments.push({ p0: cur, c1, c2, p1: p, line: false });
      cur = p;
      lastC = c2;
      lastQ = null;
    } else if (C === "Q" || C === "T") {
      const q: Pt = C === "Q" ? at(num(), num()) : lastQ ? [2 * cur[0] - lastQ[0], 2 * cur[1] - lastQ[1]] : cur;
      const p = at(num(), num());
      const c1: Pt = [cur[0] + (2 / 3) * (q[0] - cur[0]), cur[1] + (2 / 3) * (q[1] - cur[1])];
      const c2: Pt = [p[0] + (2 / 3) * (q[0] - p[0]), p[1] + (2 / 3) * (q[1] - p[1])];
      s.segments.push({ p0: cur, c1, c2, p1: p, line: false });
      cur = p;
      lastQ = q;
      lastC = null;
    } else if (C === "A") {
      const rx = num(), ry = num(), rot = num(), large = flag(), sweep = flag();
      const p = at(num(), num());
      s.segments.push(...arcToCubics(cur, rx, ry, rot, large, sweep, p));
      cur = p;
      lastC = lastQ = null;
    } else {
      i++; // unknown token, skip
    }
  }
  return subs.filter((s) => s.segments.length > 0);
}

/** Points of a polygon/polyline `points` attribute as one subpath. */
export function polyPath(points: string, closed: boolean): Subpath[] {
  const v = (points.match(/-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) ?? []).map(Number);
  const pts: Pt[] = [];
  for (let i = 0; i + 1 < v.length; i += 2) pts.push([v[i], v[i + 1]]);
  if (pts.length < 2) return [];
  const segments = pts.slice(1).map((p, i) => line(pts[i], p));
  if (closed) segments.push(line(pts[pts.length - 1], pts[0]));
  return [{ segments, closed, start: pts[0] }];
}
