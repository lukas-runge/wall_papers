import { describe, expect, it } from "vitest";
import { parsePath, polyPath } from "./svgpath";

describe("path parser", () => {
  it("handles relative lines and closing", () => {
    const [s] = parsePath("M10,10h30v20H10z");
    expect(s.closed).toBe(true);
    expect(s.segments.map((x) => x.p1)).toEqual([[40, 10], [40, 30], [10, 30], [10, 10]]);
  });

  it("splits subpaths", () => {
    expect(parsePath("M0 0L1 1ZM5 5L6 6Z")).toHaveLength(2);
  });

  it("reflects control points for S", () => {
    const [s] = parsePath("M0,0C0,10 10,10 10,0S20,-10 20,0");
    expect(s.segments[1].c1).toEqual([10, -10]);
  });

  it("turns quadratics into cubics", () => {
    const [s] = parsePath("M0,0Q10,10 20,0");
    expect(s.segments[0].c1[0]).toBeCloseTo(20 / 3);
    expect(s.segments[0].c2[0]).toBeCloseTo(40 / 3);
  });

  it("turns arcs into cubics ending on the arc end point", () => {
    const [s] = parsePath("M0,0a10,10 0 0,1 20,0");
    const last = s.segments[s.segments.length - 1];
    expect(last.p1[0]).toBeCloseTo(20);
    expect(last.p1[1]).toBeCloseTo(0);
  });

  it("reads compact arc flags", () => {
    const [s] = parsePath("M0,0a5 5 0 015 5");
    expect(s.segments[s.segments.length - 1].p1).toEqual([5, 5]);
  });

  it("reads polygons", () => {
    const [s] = polyPath("0 0 10 0 10 10", true);
    expect(s.segments).toHaveLength(3);
  });
});
