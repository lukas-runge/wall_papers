import { describe, expect, it } from "vitest";
import {
  DEFAULT_VARIANT,
  STORAGE_KEY,
  addShared,
  colourInfo,
  defaultState,
  fileNames,
  findShared,
  loadState,
  replaceWithShared,
  saveState,
  sameVariant,
  shareHash,
  sharedVariants,
  type Variant,
} from "./state";

const pinkFirst: Variant = { ...DEFAULT_VARIANT, line1: "::1_", line2: "FIRST", colour: "pink", placement: "centered", slots: { ...DEFAULT_VARIANT.slots, R2: "asset:Icon_Cat" }, width: 3456, height: 2234, format: "figcraft" };
const ownBlue: Variant = { ...DEFAULT_VARIANT, colour: "#123456", slots: { ...DEFAULT_VARIANT.slots }, format: "svg" };

function memoryStorage() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
}

describe("local storage", () => {
  it("starts with the original wallpaper", () => {
    expect(loadState(memoryStorage())).toEqual(defaultState());
    expect(loadState(undefined)).toEqual(defaultState());
  });

  it("round-trips the variants and the selection", () => {
    const store = memoryStorage();
    const st = { variants: [DEFAULT_VARIANT, pinkFirst, ownBlue], active: 2 };
    saveState(store, st);
    expect(loadState(store)).toEqual(st);
  });

  it("survives broken or blocked storage", () => {
    const store = memoryStorage();
    store.m.set(STORAGE_KEY, "{nope");
    expect(loadState(store)).toEqual(defaultState());
    const blocked = { getItem: () => { throw new Error("SecurityError"); }, setItem: () => { throw new Error("QuotaExceeded"); } };
    expect(loadState(blocked)).toEqual(defaultState());
    expect(() => saveState(blocked, defaultState())).not.toThrow();
  });
});

describe("share links", () => {
  it("round-trip one variant and several", () => {
    expect(sharedVariants(`#${shareHash([pinkFirst])}`)).toEqual([pinkFirst]);
    expect(sharedVariants(`#${shareHash([DEFAULT_VARIANT, pinkFirst, ownBlue])}`)).toEqual([DEFAULT_VARIANT, pinkFirst, ownBlue]);
  });

  it("stay short", () => {
    expect(shareHash([pinkFirst]).length).toBeLessThan(260);
  });

  it("are empty without a link and ignore nonsense", () => {
    expect(sharedVariants("")).toEqual([]);
    expect(sharedVariants("#v=bm9wZQ")).toEqual([]);
    expect(sharedVariants("#s=bm9wZQ")).toEqual([]);
  });

  it("clean up what they carry", () => {
    const bad = sharedVariants(`#s=${btoa(JSON.stringify({ v: [{ colour: "javascript:", slots: { L1: "<script>" }, width: -5, format: "exe" }] }))}`)[0];
    expect(bad.colour).toBe("green");
    expect(bad.slots.L1).toBe(DEFAULT_VARIANT.slots.L1);
    expect(bad.width).toBe(7680);
    expect(bad.format).toBe("png");
  });
});

describe("old links (whole state in the URL)", () => {
  it("share all their variants", () => {
    const list = sharedVariants(`#s=${btoa(JSON.stringify({ v: [{ colour: "pink" }, { colour: "green", format: "svg" }], a: 1 }))}`);
    expect(list.map((x) => x.colour)).toEqual(["pink", "green"]);
  });
  it("move the former global size and format into every variant", () => {
    const list = sharedVariants(`#s=${btoa(JSON.stringify({ v: [{ colour: "pink" }, { colour: "green", format: "svg" }], w: 3024, h: 1964, f: "figcraft" }))}`);
    expect(list.map((v) => [v.width, v.height, v.format])).toEqual([[3024, 1964, "figcraft"], [3024, 1964, "svg"]]);
  });
  it("still read the German colour ids", () => {
    const list = sharedVariants(`#s=${btoa(JSON.stringify({ v: [{ colour: "tuerkis" }, { colour: "gelb" }] }))}`);
    expect(list.map((x) => x.colour)).toEqual(["turquoise", "yellow"]);
  });
});

describe("opening a share link", () => {
  const st = { variants: [DEFAULT_VARIANT, pinkFirst], active: 0 };

  it("finds variants that are already there", () => {
    expect(sameVariant(pinkFirst, { ...pinkFirst, slots: { ...pinkFirst.slots } })).toBe(true);
    expect(sameVariant(pinkFirst, { ...pinkFirst, width: 3840 })).toBe(false);
    expect(findShared(st, [pinkFirst, ownBlue])).toEqual([1, -1]);
  });

  it("adds only new variants and selects the first shared one", () => {
    expect(addShared(st, [ownBlue])).toEqual({ variants: [DEFAULT_VARIANT, pinkFirst, ownBlue], active: 2 });
    expect(addShared(st, [pinkFirst, ownBlue])).toEqual({ variants: [DEFAULT_VARIANT, pinkFirst, ownBlue], active: 1 });
  });

  it("replaces the selected variant with one shared variant", () => {
    expect(replaceWithShared({ ...st, active: 1 }, [ownBlue])).toEqual({ variants: [DEFAULT_VARIANT, ownBlue], active: 1 });
  });

  it("replaces the whole list with several shared variants", () => {
    expect(replaceWithShared(st, [ownBlue, pinkFirst])).toEqual({ variants: [ownBlue, pinkFirst], active: 0 });
  });
});

describe("colours", () => {
  it("names CI and own colours", () => {
    expect(colourInfo("turquoise")).toMatchObject({ index: "1", name: "Turquoise" });
    expect(colourInfo("#00B4FF")).toMatchObject({ index: "X", name: "00b4ff" });
  });
});

describe("file names", () => {
  it("follows the scheme of the hand-made exports and stays unique", () => {
    const v = { ...DEFAULT_VARIANT, line1: "SELF_", line2: "HOSTED" };
    expect(fileNames([{ ...v, colour: "turquoise" }, { ...v, colour: "green" }, { ...v, colour: "green" }, { ...v, colour: "green", format: "svg" }])).toEqual([
      "40C3_SELF_HOSTED_1_Turquoise.png",
      "40C3_SELF_HOSTED_0_Green.png",
      "40C3_SELF_HOSTED_0_Green-2.png",
      "40C3_SELF_HOSTED_0_Green.svg",
    ]);
  });
});
