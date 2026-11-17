/**
 * Converts wallpaper SVGs into a native FigCraft document (.figcraft = ZIP with
 * document.json). Each variant becomes one frame with editable layers: groups,
 * rectangles, vectors (paths as vector networks), masks and live text.
 *
 * Only the SVG subset the wallpaper generator writes is supported: g, use,
 * nested svg, rect, path, polygon, polyline, line, circle, ellipse, text,
 * inline presentation attributes, radial gradients in user space, luminance
 * masks and clip paths.
 */
import { strToU8, zipSync } from "fflate";
import { parsePath, polyPath, type Pt, type Subpath } from "./svgpath";
import { HACK_ADVANCE_EM } from "./layout";

type M = [number, number, number, number, number, number];
const I: M = [1, 0, 0, 1, 0, 0];
const mul = (m: M, n: M): M => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];
const apply = (m: M, [x, y]: Pt): Pt => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
const applyVec = (m: M, [x, y]: Pt): Pt => [m[0] * x + m[2] * y, m[1] * x + m[3] * y];
const scaleOf = (m: M) => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));

export function parseTransform(t: string | null): M {
  let m = I;
  if (!t) return m;
  for (const [, fn, args] of t.matchAll(/(\w+)\s*\(([^)]*)\)/g)) {
    const a = args.split(/[\s,]+/).filter(Boolean).map(Number);
    let n: M = I;
    if (fn === "translate") n = [1, 0, 0, 1, a[0] ?? 0, a[1] ?? 0];
    else if (fn === "scale") n = [a[0], 0, 0, a[1] ?? a[0], 0, 0];
    else if (fn === "matrix") n = a as M;
    else if (fn === "rotate") {
      const r = ((a[0] ?? 0) * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
      n = [c, s, -s, c, 0, 0];
      if (a.length === 3) n = mul(mul([1, 0, 0, 1, a[1], a[2]], n), [1, 0, 0, 1, -a[1], -a[2]]);
    } else if (fn === "skewX") n = [1, 0, Math.tan((a[0] * Math.PI) / 180), 1, 0, 0];
    else if (fn === "skewY") n = [1, Math.tan((a[0] * Math.PI) / 180), 0, 1, 0, 0];
    m = mul(m, n);
  }
  return m;
}

// ---------------------------------------------------------------------------
// Paints

interface Rgba { r: number; g: number; b: number; a: number }
const NAMED: Record<string, string> = { white: "#ffffff", black: "#000000" };

export function parseColour(v: string | null | undefined): Rgba | null {
  if (!v || v === "none" || v === "transparent") return null;
  let h = NAMED[v.toLowerCase()] ?? v.trim();
  if (/^#[0-9a-f]{3}$/i.test(h)) h = `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}`;
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(h);
  if (!m) return null;
  return { r: parseInt(m[1], 16) / 255, g: parseInt(m[2], 16) / 255, b: parseInt(m[3], 16) / 255, a: 1 };
}

interface Radial { stops: { position: number; color: Rgba }[]; c: Pt; rx: number; ry: number }
type Paint = { kind: "solid"; color: Rgba } | { kind: "radial"; g: Radial };

const solidJson = (c: Rgba) => ({ type: "solid", color: c, opacity: 1, visible: true, blend: "normal" });

// ---------------------------------------------------------------------------
// Intermediate tree (absolute coordinates inside the frame)

type Box = [number, number, number, number];
interface Node {
  type: "frame" | "group" | "rectangle" | "vector" | "text";
  name: string;
  box: Box;
  children?: Node[];
  fill?: Paint | null;
  stroke?: { color: Rgba; weight: number; miter: number } | null;
  opacity?: number;
  mask?: boolean;
  network?: { vertices: Pt[]; segments: { a: number; b: number; ta: Pt; tb: Pt }[]; regions: { loops: number[][]; winding: string }[] };
  text?: { characters: string; size: number; family: string; style: string; spacing: number[] };
}

interface Style {
  fill: string;
  stroke: string;
  strokeWidth: number;
  miter: number;
  fillRule: string;
  fontSize: number;
  fontFamily: string;
  fontWeight: string;
}
const ROOT_STYLE: Style = { fill: "#000000", stroke: "none", strokeWidth: 1, miter: 4, fillRule: "nonzero", fontSize: 16, fontFamily: "Hack", fontWeight: "400" };

const union = (boxes: Box[]): Box =>
  boxes.reduce<Box>((u, b) => [Math.min(u[0], b[0]), Math.min(u[1], b[1]), Math.max(u[2], b[2]), Math.max(u[3], b[3])], [Infinity, Infinity, -Infinity, -Infinity]);

function attr(el: Element, name: string): string | null {
  const v = el.getAttribute(name);
  if (v !== null) return v;
  const m = new RegExp(`(?:^|;)\\s*${name}\\s*:\\s*([^;]+)`).exec(el.getAttribute("style") ?? "");
  return m ? m[1].trim() : null;
}

class Converter {
  private defs = new Map<string, Element>();
  constructor(private doc: Document) {
    for (const el of Array.from(doc.querySelectorAll("[id]"))) this.defs.set(el.id, el);
  }

  private ref(v: string | null): Element | undefined {
    const m = v && /url\(#([^)]+)\)/.exec(v);
    return m ? this.defs.get(m[1]) : (v?.startsWith("#") ? this.defs.get(v.slice(1)) : undefined);
  }

  private style(el: Element, parent: Style): Style {
    const s = { ...parent };
    const f = attr(el, "fill"); if (f !== null) s.fill = f;
    const st = attr(el, "stroke"); if (st !== null) s.stroke = st;
    const sw = attr(el, "stroke-width"); if (sw !== null) s.strokeWidth = parseFloat(sw);
    const ml = attr(el, "stroke-miterlimit"); if (ml !== null) s.miter = parseFloat(ml);
    const fr = attr(el, "fill-rule"); if (fr !== null) s.fillRule = fr;
    const fs = attr(el, "font-size"); if (fs !== null) s.fontSize = parseFloat(fs);
    const ff = attr(el, "font-family"); if (ff !== null) s.fontFamily = ff.split(",")[0].replace(/["']/g, "").trim();
    const fw = attr(el, "font-weight"); if (fw !== null) s.fontWeight = fw;
    return s;
  }

  private paint(v: string, m: M): Paint | null {
    const grad = this.ref(v);
    if (grad?.tagName === "radialGradient") {
      const gm = mul(m, parseTransform(grad.getAttribute("gradientTransform")));
      const c = apply(gm, [Number(grad.getAttribute("cx") ?? 0), Number(grad.getAttribute("cy") ?? 0)]);
      const r = Number(grad.getAttribute("r") ?? 1);
      const stops = Array.from(grad.querySelectorAll("stop")).map((s) => {
        const color = parseColour(s.getAttribute("stop-color")) ?? { r: 0, g: 0, b: 0, a: 1 };
        return { position: Number(s.getAttribute("offset") ?? 0), color: { ...color, a: Number(s.getAttribute("stop-opacity") ?? 1) } };
      });
      return { kind: "radial", g: { stops, c, rx: Math.abs(gm[0]) * r, ry: Math.abs(gm[3]) * r } };
    }
    const color = parseColour(v);
    return color ? { kind: "solid", color } : null;
  }

  private strokeOf(s: Style, m: M): Node["stroke"] {
    const color = parseColour(s.stroke);
    return color && s.strokeWidth > 0 ? { color, weight: s.strokeWidth * scaleOf(m), miter: s.miter } : null;
  }

  /** One group for `el`: mask or clip shapes first (they apply to the layers above), then the content. */
  private group(el: Element, kids: Node[], m: M, name: string): Node[] {
    if (!kids.length) return [];
    const mask = this.ref(el.getAttribute("mask"));
    const clip = this.ref(el.getAttribute("clip-path"));
    const op = el.getAttribute("opacity");
    const maskNodes: Node[] = [];
    if (mask) for (const c of Array.from(mask.children)) maskNodes.push(...this.walk(c, m, ROOT_STYLE));
    if (clip) {
      // A clip path is its geometry only: fully opaque white in a luminance mask.
      const shapes = Array.from(clip.children).flatMap((c) => this.walk(c, mul(m, parseTransform(clip.getAttribute("transform"))), ROOT_STYLE));
      const white = (n: Node) => {
        if (n.type !== "group") {
          n.fill = { kind: "solid", color: { r: 1, g: 1, b: 1, a: 1 } };
          n.stroke = null;
        }
        n.children?.forEach(white);
      };
      shapes.forEach(white);
      maskNodes.push(...shapes);
    }
    for (const mn of maskNodes) {
      mn.mask = true;
      mn.name = "Mask";
    }
    const all = [...maskNodes, ...kids];
    return [{ type: "group", name, box: union(all.map((c) => c.box)), children: all, opacity: op === null ? undefined : Number(op) }];
  }

  /** Leaf layers only get a group around them when they carry a mask, clip path or opacity. */
  private decorate(el: Element, nodes: Node[], m: M, name: string): Node[] {
    if (el.hasAttribute("mask") || el.hasAttribute("clip-path") || el.hasAttribute("opacity")) return this.group(el, nodes, m, name);
    return nodes;
  }

  walk(el: Element, m: M, parent: Style): Node[] {
    const tag = el.tagName;
    if (["defs", "style", "mask", "clipPath", "radialGradient", "linearGradient", "title", "desc", "metadata", "symbol"].includes(tag)) return [];
    const local = mul(m, parseTransform(el.getAttribute("transform")));
    const s = this.style(el, parent);
    const name = el.getAttribute("data-name") ?? "";

    if (tag === "g") {
      const kids = Array.from(el.children).flatMap((c) => this.walk(c, local, s));
      return this.group(el, kids, local, name || "Group");
    }
    if (tag === "use") {
      const target = this.ref(el.getAttribute("href") ?? el.getAttribute("xlink:href"));
      if (!target) return [];
      const at = mul(local, [1, 0, 0, 1, Number(el.getAttribute("x") ?? 0), Number(el.getAttribute("y") ?? 0)]);
      const kids = target.tagName === "g" ? Array.from(target.children).flatMap((c) => this.walk(c, at, this.style(target, s))) : this.walk(target, at, s);
      return this.group(el, kids, at, target.getAttribute("data-name") ?? "Group");
    }
    if (tag === "svg") {
      const x = Number(el.getAttribute("x") ?? 0), y = Number(el.getAttribute("y") ?? 0);
      const vb = el.getAttribute("viewBox")?.split(/[\s,]+/).map(Number);
      let vm: M = [1, 0, 0, 1, x, y];
      if (vb?.length === 4) {
        const w = Number(el.getAttribute("width") ?? vb[2]), h = Number(el.getAttribute("height") ?? vb[3]);
        vm = mul(vm, [w / vb[2], 0, 0, h / vb[3], -vb[0] * (w / vb[2]), -vb[1] * (h / vb[3])]);
      }
      const im = mul(local, vm);
      const kids = Array.from(el.children).flatMap((c) => this.walk(c, im, s));
      return this.group(el, kids, im, name || "Graphic");
    }
    if (tag === "text") return this.decorate(el, this.text(el, local, s), local, name || "Text");

    let subs: Subpath[] = [];
    if (tag === "rect") {
      const x = Number(el.getAttribute("x") ?? 0), y = Number(el.getAttribute("y") ?? 0);
      const w = Number(el.getAttribute("width") ?? 0), h = Number(el.getAttribute("height") ?? 0);
      if (w <= 0 || h <= 0) return [];
      let rx = Number(el.getAttribute("rx") ?? el.getAttribute("ry") ?? 0), ry = Number(el.getAttribute("ry") ?? el.getAttribute("rx") ?? 0);
      rx = Math.min(rx, w / 2);
      ry = Math.min(ry, h / 2);
      if (rx > 0 && ry > 0) {
        subs = parsePath(
          `M${x + rx},${y}h${w - 2 * rx}a${rx},${ry} 0 0 1 ${rx},${ry}v${h - 2 * ry}a${rx},${ry} 0 0 1 ${-rx},${ry}` +
            `h${-(w - 2 * rx)}a${rx},${ry} 0 0 1 ${-rx},${-ry}v${-(h - 2 * ry)}a${rx},${ry} 0 0 1 ${rx},${-ry}z`,
        );
      } else if (local[1] === 0 && local[2] === 0) {
        const a = apply(local, [x, y]), b = apply(local, [x + w, y + h]);
        const box: Box = [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])];
        const node: Node = { type: "rectangle", name: name || "Rectangle", box, fill: this.paint(s.fill, local), stroke: this.strokeOf(s, local) };
        return this.decorate(el, [node], local, name || "Rectangle");
      }
      if (!subs.length) subs = parsePath(`M${x},${y}h${w}v${h}h${-w}z`);
    } else if (tag === "path") subs = parsePath(el.getAttribute("d") ?? "");
    else if (tag === "polygon") subs = polyPath(el.getAttribute("points") ?? "", true);
    else if (tag === "polyline") subs = polyPath(el.getAttribute("points") ?? "", false);
    else if (tag === "line") {
      const n = (k: string) => Number(el.getAttribute(k) ?? 0);
      subs = parsePath(`M${n("x1")},${n("y1")}L${n("x2")},${n("y2")}`);
    } else if (tag === "circle" || tag === "ellipse") {
      const cx = Number(el.getAttribute("cx") ?? 0), cy = Number(el.getAttribute("cy") ?? 0);
      const rx = Number(el.getAttribute(tag === "circle" ? "r" : "rx") ?? 0), ry = Number(el.getAttribute(tag === "circle" ? "r" : "ry") ?? 0);
      subs = parsePath(`M${cx - rx},${cy}a${rx},${ry} 0 1,0 ${2 * rx},0a${rx},${ry} 0 1,0 ${-2 * rx},0z`);
    } else return [];
    if (!subs.length) return [];
    const node = this.vector(subs, local, s, name || (tag === "line" ? "Line" : "Vector"));
    return node ? this.decorate(el, [node], local, node.name) : [];
  }

  private vector(subs: Subpath[], m: M, s: Style, name: string): Node | null {
    const filled = parseColour(s.fill) !== null || s.fill.startsWith("url(");
    const vertices: Pt[] = [];
    const segments: NonNullable<Node["network"]>["segments"] = [];
    const loops: number[][] = [];
    const same = (p: Pt, q: Pt) => Math.abs(p[0] - q[0]) < 1e-6 && Math.abs(p[1] - q[1]) < 1e-6;
    for (const sub of subs) {
      const startIndex = vertices.length;
      vertices.push(apply(m, sub.segments[0].p0));
      const loop: number[] = [];
      let prev = startIndex;
      sub.segments.forEach((seg, i) => {
        const last = i === sub.segments.length - 1;
        let b: number;
        if (last && (sub.closed || filled) && same(seg.p1, sub.segments[0].p0)) b = startIndex;
        else {
          vertices.push(apply(m, seg.p1));
          b = vertices.length - 1;
        }
        const ta = seg.line ? ([0, 0] as Pt) : applyVec(m, [seg.c1[0] - seg.p0[0], seg.c1[1] - seg.p0[1]]);
        const tb = seg.line ? ([0, 0] as Pt) : applyVec(m, [seg.c2[0] - seg.p1[0], seg.c2[1] - seg.p1[1]]);
        loop.push(segments.length);
        segments.push({ a: prev, b, ta, tb });
        prev = b;
      });
      if (filled) {
        if (prev !== startIndex) {
          // SVG fills open subpaths as if closed.
          loop.push(segments.length);
          segments.push({ a: prev, b: startIndex, ta: [0, 0], tb: [0, 0] });
        }
        loops.push(loop);
      }
    }
    // Bounding box from points on the curves.
    const pts: Pt[] = [];
    for (const seg of segments) {
      const p0 = vertices[seg.a], p1 = vertices[seg.b];
      const c1: Pt = [p0[0] + seg.ta[0], p0[1] + seg.ta[1]], c2: Pt = [p1[0] + seg.tb[0], p1[1] + seg.tb[1]];
      for (let t = 0; t <= 1; t += 0.125) {
        const u = 1 - t;
        pts.push([
          u * u * u * p0[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * p1[0],
          u * u * u * p0[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * p1[1],
        ]);
      }
    }
    if (!pts.length) return null;
    const box = union(pts.map(([x, y]) => [x, y, x, y] as Box));
    const winding = s.fillRule === "evenodd" ? "evenOdd" : "nonZero";
    return {
      type: "vector",
      name,
      box,
      network: { vertices, segments, regions: loops.length ? [{ loops, winding }] : [] },
      fill: filled ? this.paint(s.fill, m) : null,
      stroke: this.strokeOf(s, m),
    };
  }

  private text(el: Element, m: M, s: Style): Node[] {
    const chars = el.textContent ?? "";
    if (!chars.trim()) return [];
    const xs = (el.getAttribute("x") ?? "0").split(/[\s,]+/).map(Number);
    const y = Number(el.getAttribute("y") ?? 0);
    const k = scaleOf(m);
    const size = s.fontSize * k;
    const adv = HACK_ADVANCE_EM * size;
    const pens = [...chars].map((_, i) => apply(m, [xs[i] ?? xs[xs.length - 1] + (i - xs.length + 1) * (adv / k), y]));
    const spacing = pens.map((p, i) => (i + 1 < pens.length ? pens[i + 1][0] - p[0] - adv : 0));
    const [x0, base] = pens[0];
    // Hack: ascent 0.9295 em, line box 1.1667 em with automatic line height.
    const top = base - 0.929527 * size;
    const w = pens[pens.length - 1][0] - x0 + adv;
    return [
      {
        type: "text",
        name: el.getAttribute("data-name") ?? chars,
        box: [x0, top, x0 + w, top + 1.1667 * size],
        fill: this.paint(s.fill, m),
        stroke: this.strokeOf(s, m),
        text: { characters: chars, size, family: s.fontFamily, style: Number(s.fontWeight) >= 600 || s.fontWeight === "bold" ? "Bold" : "Regular", spacing },
      },
    ];
  }
}

// ---------------------------------------------------------------------------
// Output

const round = (v: number) => Math.round(v * 1000) / 1000;

function paintJson(p: Paint, box: Box) {
  if (p.kind === "solid") return solidJson(p.color);
  const w = box[2] - box[0] || 1, h = box[3] - box[1] || 1;
  const fx = (p.g.c[0] - box[0]) / w, fy = (p.g.c[1] - box[1]) / h;
  return {
    type: "gradient",
    kind: "radial",
    stops: p.g.stops,
    from: [fx, fy],
    to: [fx + p.g.rx / w, fy],
    width: [fx, fy + p.g.ry / h],
    opacity: 1,
    visible: true,
    blend: "normal",
  };
}

const textStyle = (t: NonNullable<Node["text"]>, spacing: number) => ({
  font_family: t.family,
  font_style: t.style,
  font_size: round(t.size),
  line_height: { unit: "auto" },
  letter_spacing: { unit: "pixels", value: round(spacing) },
  decoration: "none",
  case: "original",
  fills: null,
  link: null,
});

export interface FigcraftFrame {
  name: string;
  svg: string;
}

/** Builds the document.json object for a list of wallpaper SVGs (one frame each, in a grid). */
export function figcraftDocument(frames: readonly FigcraftFrame[], docName: string, parse: (svg: string) => Document): object {
  const nodes: Record<string, object> = {};
  let nextId = 2;
  const page = { id: 1, name: "Wallpapers", type: "page", background: { r: 0.1176, g: 0.1176, b: 0.1176, a: 1 }, flows: [], prototype: { device: "None", background: { r: 0.11764706, g: 0.11764706, b: 0.11764706, a: 1 }, rotation: "portrait" }, children: [] as number[], width: 0, height: 0 };
  nodes["1"] = page;

  const emit = (n: Node, parentId: number, origin: Pt): number => {
    const id = nextId++;
    const [x0, y0, x1, y1] = n.box;
    const base: Record<string, unknown> = {
      id,
      name: n.name,
      type: n.type,
      parent: parentId,
      blend: "normal",
      transform: [1, 0, 0, 1, round(x0 - origin[0]), round(y0 - origin[1])],
      width: round(x1 - x0),
      height: round(y1 - y0),
    };
    if (n.opacity !== undefined) base.opacity = n.opacity;
    if (n.fill) base.fills = [paintJson(n.fill, n.box)];
    if (n.stroke) {
      base.strokes = [solidJson(n.stroke.color)];
      base.stroke = { weight: round(n.stroke.weight), align: "center", sides: null, cap_start: "none", cap_end: "none", join: "miter", miter_limit: n.stroke.miter, dashes: [] };
    }
    if (n.mask) {
      base.is_mask = true;
      base.mask_type = "luminance";
    }
    if (n.network) {
      base.network = {
        vertices: n.network.vertices.map(([x, y]) => ({ x: round(x - x0), y: round(y - y0), radius: 0 })),
        segments: n.network.segments.map((s) => ({ a: s.a, b: s.b, ta: [round(s.ta[0]), round(s.ta[1])], tb: [round(s.tb[0]), round(s.tb[1])] })),
        regions: n.network.regions,
      };
    }
    if (n.text) {
      base.characters = n.text.characters;
      base.style = textStyle(n.text, 0);
      base.runs = n.text.spacing
        .map((sp, i) => ({ start: i, end: i + 1, style: textStyle(n.text!, sp) }))
        .filter((r) => r.style.letter_spacing.value !== 0);
    }
    nodes[String(id)] = base;
    if (n.children) base.children = n.children.map((c) => emit(c, id, [x0, y0]));
    return id;
  };

  // Frames in rows of four; sizes may differ per variant.
  const parsed = frames.map((f) => {
    const doc = parse(f.svg);
    const root = doc.documentElement;
    return { f, doc, root, W: Number(root.getAttribute("width")), H: Number(root.getAttribute("height")) };
  });
  const gap = Math.round(Math.max(...parsed.map((p) => p.W)) * 0.05);
  let y = 0;
  for (let row = 0; row < parsed.length; row += 4) {
    const items = parsed.slice(row, row + 4);
    let x = 0;
    for (const { f, doc, root, W, H } of items) {
      const conv = new Converter(doc);
      const kids = Array.from(root.children).flatMap((c) => conv.walk(c, I, ROOT_STYLE));
      const id = nextId++;
      nodes[String(id)] = { id, name: f.name, type: "frame", parent: 1, transform: [1, 0, 0, 1, x, y], width: W, height: H, clip: true, children: kids.map((c) => emit(c, id, [0, 0])) };
      page.children.push(id);
      x += W + gap;
    }
    y += Math.max(...items.map((p) => p.H)) + gap;
  }

  return {
    format: "figcraft",
    version: 1,
    imageIndex: [],
    name: docName,
    pages: [1],
    nodes,
    next_id: nextId,
    styles: [],
    variables: { collections: [], variables: [] },
    current_page: 1,
    document_colors: [],
    comments: [],
  };
}

/** The .figcraft file (ZIP) for a list of wallpaper SVGs. */
export function figcraftFile(frames: readonly FigcraftFrame[], docName: string, thumbnail?: Uint8Array): Uint8Array {
  const parse = (svg: string) => new DOMParser().parseFromString(svg, "image/svg+xml");
  const files: Record<string, Uint8Array> = { "document.json": strToU8(JSON.stringify(figcraftDocument(frames, docName, parse))) };
  if (thumbnail) files["thumbnail.png"] = thumbnail;
  return zipSync(files, { level: 6 });
}
