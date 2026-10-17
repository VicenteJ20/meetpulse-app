import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  Image,
  Link,
  Font,
  StyleSheet,
} from "@react-pdf/renderer";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import { reportBrand as brand, reportTime, ReportSnapshot } from "./branding";

type Node = {
  type: string;
  value?: string;
  url?: string;
  depth?: number;
  ordered?: boolean;
  children?: Node[];
};
const styles = StyleSheet.create({
  page: {
    fontFamily: brand.font,
    fontSize: brand.fontSize,
    lineHeight: 1.45,
    paddingLeft: brand.margin,
    paddingRight: brand.margin,
    paddingTop: 78,
    paddingBottom: 60,
    color: brand.ink,
  },
  header: {
    position: "absolute",
    top: 24,
    left: brand.margin,
    right: brand.margin,
    flexDirection: "row",
    alignItems: "center",
    borderBottom: `1 solid ${brand.accent}`,
    paddingBottom: 10,
  },
  logo: { width: 23, height: 23, marginRight: 8 },
  title: { fontSize: 23, fontWeight: 600, lineHeight: 1.2, marginBottom: 8 },
  meta: { color: brand.muted, fontSize: 9, marginBottom: 18 },
  p: { marginBottom: 8 },
  heading: {
    fontWeight: 600,
    color: brand.accent,
    marginTop: 13,
    marginBottom: 6,
  },
  footer: { position: "absolute", top: 806, fontSize: 8, color: brand.muted },
  row: { flexDirection: "row", borderBottom: "0.5 solid #dbe2ea" },
  cell: { flex: 1, padding: 5, fontSize: 9 },
});
function inline(nodes: Node[] = []): React.ReactNode {
  return nodes.map((n, i) =>
    n.type === "link" && /^(https?:|mailto:)/i.test(n.url || "") ? (
      <Link key={i} src={n.url!}>
        {inline(n.children)}
      </Link>
    ) : n.type === "strong" ? (
      <Text key={i} style={{ fontWeight: 600 }}>
        {inline(n.children)}
      </Text>
    ) : n.type === "break" ? (
      "\n"
    ) : (
      (n.value ?? inline(n.children))
    ),
  );
}
function blocks(nodes: Node[] = []): React.ReactNode {
  return nodes.map((n, i) => {
    switch (n.type) {
      case "heading":
        return (
          <Text
            key={i}
            minPresenceAhead={30}
            style={[
              styles.heading,
              { fontSize: n.depth === 1 ? 18 : n.depth === 2 ? 15 : 12 },
            ]}
          >
            {inline(n.children)}
          </Text>
        );
      case "paragraph":
        return (
          <Text key={i} style={styles.p}>
            {inline(n.children)}
          </Text>
        );
      case "list":
        return (
          <View key={i} style={{ marginLeft: 12, marginBottom: 8 }}>
            {n.children?.map((child, j) => (
              <View key={j} style={{ flexDirection: "row" }}>
                <Text style={{ width: 20 }}>
                  {n.ordered ? `${j + 1}.` : "•"}
                </Text>
                <View style={{ flex: 1 }}>{blocks(child.children)}</View>
              </View>
            ))}
          </View>
        );
      case "table":
        return (
          <View key={i} style={{ marginVertical: 8 }}>
            {n.children?.map((row, j) => (
              <View
                key={j}
                wrap={j !== 0}
                style={[
                  styles.row,
                  j === 0
                    ? { backgroundColor: "#edf3f8", fontWeight: 600 }
                    : {},
                ]}
              >
                {row.children?.map((cell, k) => (
                  <View key={k} style={styles.cell}>
                    <Text style={{ fontWeight: j === 0 ? 600 : 400 }}>{inline(cell.children)}</Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
        );
      case "blockquote":
        return (
          <View
            key={i}
            style={{
              borderLeft: `2 solid ${brand.accent}`,
              paddingLeft: 10,
              marginVertical: 8,
            }}
          >
            {blocks(n.children)}
          </View>
        );
      case "code":
        return (
          <Text
            key={i}
            style={{
              fontFamily: "Courier",
              fontSize: 8,
              backgroundColor: "#f1f5f9",
              padding: 8,
              marginBottom: 8,
            }}
          >
            {n.value}
          </Text>
        );
      case "thematicBreak":
        return (
          <View
            key={i}
            style={{ borderBottom: "1 solid #dbe2ea", marginVertical: 8 }}
          />
        );
      case "html":
      case "image":
        return null;
      default:
        return (
          <View key={i}>
            {n.children ? blocks(n.children) : <Text>{n.value || ""}</Text>}
          </View>
        );
    }
  });
}
function TranscriptionTemplate({
  segments,
}: {
  segments: ReportSnapshot["segments"];
}) {
  return (
    <>
      {segments?.map((s, i) => (
        <View key={i} wrap={s.text.length > 1200} style={{ marginBottom: 9 }}>
          <Text
            style={{ fontSize: 8, color: brand.muted }}
            minPresenceAhead={16}
          >
            {reportTime(s.start)}
          </Text>
          <Text>{s.text}</Text>
        </View>
      ))}
    </>
  );
}
function AnalysisTemplate({ markdown }: { markdown: string }) {
  const tree = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .parse(markdown) as Node;
  return <>{blocks(tree.children)}</>;
}
export function buildReport(snapshot: ReportSnapshot) {
  const asset = (path: string) => new URL(path, snapshot.assetBase).href;
  Font.register({
    family: brand.font,
    fonts: [
      { src: asset(brand.regularFont), fontWeight: 400 },
      { src: asset(brand.boldFont), fontWeight: 600 },
    ],
  });
  const label =
    snapshot.locale === "es"
      ? snapshot.kind === "analysis"
        ? "Análisis de reunión"
        : "Transcripción"
      : snapshot.kind === "analysis"
        ? "Meeting analysis"
        : "Transcript";
  return (
    <Document
      title={snapshot.title}
      author={brand.name}
      subject={label}
      language={snapshot.locale}
    >
      <Page size="A4" style={styles.page}>
        <View fixed style={styles.header}>
          <Image src={asset(brand.logo)} style={styles.logo} />
          <Text style={{ fontWeight: 600, color: brand.accent }}>
            {brand.name}
          </Text>
          <Text style={{ marginLeft: "auto", fontSize: 9, color: brand.muted }}>
            {label}
          </Text>
        </View>
        <Text style={styles.title}>{snapshot.title}</Text>
        <Text style={styles.meta}>
          {[snapshot.date, snapshot.client, snapshot.project]
            .filter(Boolean)
            .join(" · ")}
        </Text>
        {snapshot.kind === "transcript" ? (
          <TranscriptionTemplate segments={snapshot.segments} />
        ) : (
          <AnalysisTemplate markdown={snapshot.markdown || ""} />
        )}
        <Text fixed style={[styles.footer, { left: brand.margin }]}>
          {brand.name}
        </Text>
        <Text
          fixed
          style={[styles.footer, { right: brand.margin }]}
          render={({ pageNumber, totalPages }) =>
            `${pageNumber} / ${totalPages}`
          }
        />
      </Page>
    </Document>
  );
}
