export interface PhotoSpec {
  id: string;
  label: string;
  /** Physical width in mm */
  widthMm: number;
  /** Physical height in mm */
  heightMm: number;
  /** Output DPI (for DPI metadata embedded in JPEG) */
  dpi: number;
  /** Target head-height fraction of the frame height, for oval sizing */
  headHeightPct: number;
  /** Background colour (CSS colour value) */
  background: string;
  /** Number of tile columns on the 4R sheet */
  sheetCols: number;
  /** Number of tile rows on the 4R sheet */
  sheetRows: number;
}

function pxFromMm(mm: number, dpi: number): number {
  return Math.round((mm / 25.4) * dpi);
}

export function computeOutputPx(spec: PhotoSpec): { widthPx: number; heightPx: number } {
  return {
    widthPx: pxFromMm(spec.widthMm, spec.dpi),
    heightPx: pxFromMm(spec.heightMm, spec.dpi),
  };
}

/** Aspect ratio of the output photo (width / height) */
export function outputAspect(spec: PhotoSpec): number {
  const { widthPx, heightPx } = computeOutputPx(spec);
  return widthPx / heightPx;
}

export const PRESETS: PhotoSpec[] = [
  {
    id: "passport",
    label: "Malaysia Passport",
    widthMm: 35,
    heightMm: 50,
    dpi: 300,
    headHeightPct: 0.56,
    background: "#ffffff",
    sheetCols: 2,
    sheetRows: 3,
  },
  {
    id: "mykad",
    label: "MyKad Photo Window",
    widthMm: 23,
    heightMm: 30,
    dpi: 300,
    headHeightPct: 0.58,
    background: "#ffffff",
    sheetCols: 4,
    sheetRows: 5,
  },
];

export function getPreset(id: string): PhotoSpec | undefined {
  return PRESETS.find((p) => p.id === id);
}
