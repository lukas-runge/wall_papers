import { describe, expect, it } from "vitest";
import { DEFAULT_VARIANT, colourInfo, defaultState, fileNames, readState, writeState } from "./state";

describe("URL state", () => {
  it("keeps the URL empty for the original", () => {
    expect(writeState(defaultState())).toBe("");
    expect(readState("")).toEqual(defaultState());
  });

  it("round-trips several variants and the export settings", () => {
    const st = defaultState();
    st.variants.push({ ...DEFAULT_VARIANT, line1: "::1_", line2: "FIRST", colour: "pink", placement: "centered", slots: { ...DEFAULT_VARIANT.slots, R2: "asset:Icon_Cat" } });
    st.variants.push({ ...DEFAULT_VARIANT, colour: "#123456", slots: { ...DEFAULT_VARIANT.slots } });
    st.active = 2;
    st.width = 3456;
    st.height = 2234;
    st.format = "figcraft";
    expect(readState(`#${writeState(st)}`)).toEqual(st);
  });

  it("ignores nonsense", () => {
    const st = readState("#s=bm9wZQ");
    expect(st).toEqual(defaultState());
    const bad = readState(`#s=${btoa(JSON.stringify({ v: [{ colour: "javascript:", slots: { L1: "<script>" } }], w: -5, f: "exe" }))}`);
    expect(bad.variants[0].colour).toBe("green");
    expect(bad.variants[0].slots.L1).toBe(DEFAULT_VARIANT.slots.L1);
    expect(bad.width).toBe(7680);
    expect(bad.format).toBe("png");
  });
});

describe("colours", () => {
  it("still reads the German colour ids of old links", () => {
    const old = readState(`#s=${btoa(JSON.stringify({ v: [{ colour: "tuerkis" }, { colour: "gelb" }] }))}`);
    expect(old.variants.map((x) => x.colour)).toEqual(["turquoise", "yellow"]);
  });

  it("names CI and own colours", () => {
    expect(colourInfo("turquoise")).toMatchObject({ index: "1", name: "Turquoise" });
    expect(colourInfo("#00B4FF")).toMatchObject({ index: "X", name: "00b4ff" });
  });
});

describe("file names", () => {
  it("follows the scheme of the hand-made exports and stays unique", () => {
    const v = { ...DEFAULT_VARIANT, line1: "SELF_", line2: "HOSTED" };
    expect(fileNames([{ ...v, colour: "turquoise" }, { ...v, colour: "green" }, { ...v, colour: "green" }], "png")).toEqual([
      "40C3_SELF_HOSTED_1_Turquoise.png",
      "40C3_SELF_HOSTED_0_Green.png",
      "40C3_SELF_HOSTED_0_Green-2.png",
    ]);
  });
});
