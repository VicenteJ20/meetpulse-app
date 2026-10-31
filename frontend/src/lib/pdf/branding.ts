/** Code-owned report template: edit these tokens to customize both PDF exports. */
export const reportBrand = {
  name: "MeetPulse",
  accent: "#0b5fa5",
  ink: "#162437",
  muted: "#526477",
  font: "SourceSans",
  fontSize: 11,
  margin: 44,
  regularFont: "/fonts/source-sans-3-latin-400-normal.woff",
  boldFont: "/fonts/source-sans-3-latin-600-normal.woff",
  logo: "/icon.png",
};
export interface ReportSnapshot {
  kind: "transcript" | "analysis";
  locale: "en" | "es";
  title: string;
  date: string;
  client?: string;
  project?: string;
  markdown?: string;
  segments?: { text: string; start?: number }[];
  assetBase: string;
}
export const reportTime = (seconds = 0) => {
  const total = Math.max(0, Math.floor(seconds));
  return `${Math.floor(total / 60)
    .toString()
    .padStart(2, "0")}:${(total % 60).toString().padStart(2, "0")}`;
};
