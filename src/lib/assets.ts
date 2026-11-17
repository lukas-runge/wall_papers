import pattern0 from "./assets/svg/Pattern0.svg?raw";
import pattern1 from "./assets/svg/Pattern1.svg?raw";
import pattern2 from "./assets/svg/Pattern2.svg?raw";
import pattern3 from "./assets/svg/Pattern3.svg?raw";
import logoA from "./assets/svg/logo-a.svg?raw";
import hackBold from "./assets/fonts/Hack-Bold.woff2?url";
import type { AssetSource } from "./banner";

export const PATTERNS = [pattern0, pattern1, pattern2, pattern3];
export const LOGO_SVG = logoA;
export const HACK_BOLD_URL = hackBold;

const raw = import.meta.glob<string>("./assets/creatures/*.svg", { query: "?raw", import: "default", eager: true });

const CITIZENS = new Set(["Adam", "Barbara", "bip", "Blahaj", "Luckycat", "Mona"]);
const LABELS: Record<string, string> = {
  Blahaj: "Blåhaj",
  Mona: "Mona (solid)",
  Icon_10: "Icon 10",
  Icon_HelloThere: "Hello there",
  Icon_KeyShort: "Key",
  Icon_Blinkenheart: "Blinkenheart",
  Icon_Bitspider: "Bitspider",
};

export const ASSETS: AssetSource[] = Object.entries(raw)
  .map(([path, svg]) => {
    const id = path.split("/").pop()!.replace(/\.svg$/, "");
    const label = LABELS[id] ?? id.replace(/^Icon_/, "").replace(/(\D)(\d)$/, "$1 $2");
    return { id, label, group: CITIZENS.has(id) ? ("Citizens" as const) : ("Icons" as const), svg };
  })
  .sort((a, b) => (a.group === b.group ? a.label.localeCompare(b.label) : a.group === "Citizens" ? -1 : 1));
