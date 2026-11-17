import { describe, expect, it } from "vitest";
import { DEFAULT_STATE, fileName, readState, writeState } from "./state";

describe("URL state", () => {
  it("keeps the URL empty for the original", () => {
    expect(writeState(DEFAULT_STATE)).toBe("");
    expect(readState("")).toEqual(DEFAULT_STATE);
  });

  it("round-trips a variant", () => {
    const st = { ...DEFAULT_STATE, line1: "::1_", line2: "FIRST", placement: "centered" as const, active: "pink", custom: "#123456", size: "custom" as const, w: 3000, h: 2000, slots: { ...DEFAULT_STATE.slots, R2: "asset:Icon_Cat" } };
    expect(readState(`#${writeState(st)}`)).toEqual(st);
  });

  it("ignores nonsense", () => {
    const st = readState("#c=nope&x=zzz&z=huge&w=-5");
    expect(st.active).toBe(DEFAULT_STATE.active);
    expect(st.custom).toBe(DEFAULT_STATE.custom);
    expect(st.size).toBe(DEFAULT_STATE.size);
  });
});

describe("file names", () => {
  it("follows the scheme of the hand-made exports", () => {
    expect(fileName(["SELF_", "HOSTED"], { index: "1", name: "Türkis" }, "png")).toBe("40C3_SELF_HOSTED_1_Tuerkis.png");
    expect(fileName(["SELF_", "HOSTED"], { index: "0", name: "Grün" }, "png")).toBe("40C3_SELF_HOSTED_0_Gruen.png");
  });
});
