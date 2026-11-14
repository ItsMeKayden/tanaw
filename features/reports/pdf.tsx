/**
 * PDF reports with @react-pdf/renderer (server-side). Renders the report's
 * title, filters, optional shaded map + legend, and tables (which flow onto
 * new pages, repeating their header).
 */
import {
  Document,
  Font,
  Page,
  Path,
  Rect,
  StyleSheet,
  Svg,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";

import type { Report, ReportTable, ReportValue } from "@/features/reports/report";

// Keep words whole (no "Kanlu- ran" style hyphenation in narrow columns).
Font.registerHyphenationCallback((word) => [word]);

const styles = StyleSheet.create({
  page: { paddingTop: 36, paddingBottom: 48, paddingHorizontal: 36, fontSize: 9, fontFamily: "Helvetica", color: "#0b0b0b" },
  title: { fontSize: 16, fontFamily: "Helvetica-Bold", marginBottom: 4 },
  meta: { fontSize: 9, color: "#52514e", marginBottom: 1 },
  section: { marginTop: 14 },
  sectionTitle: { fontSize: 11, fontFamily: "Helvetica-Bold", marginBottom: 6 },
  table: { borderWidth: 0.5, borderColor: "#737373" },
  headerRow: { flexDirection: "row", backgroundColor: "#e3e4f8", borderBottomWidth: 0.5, borderColor: "#737373" },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderColor: "#d4d4d4" },
  cell: { paddingVertical: 3, paddingHorizontal: 4 },
  headerCell: { paddingVertical: 4, paddingHorizontal: 4, fontFamily: "Helvetica-Bold" },
  empty: { padding: 8, color: "#52514e" },
  mapRow: { flexDirection: "row", gap: 16, marginTop: 12 },
  legendTitle: { fontFamily: "Helvetica-Bold", marginBottom: 4 },
  legendItem: { flexDirection: "row", alignItems: "center", marginBottom: 3 },
  swatch: { width: 10, height: 10, marginRight: 6, borderWidth: 0.5, borderColor: "#00000022" },
  note: { fontSize: 7.5, color: "#52514e", marginTop: 10 },
  footer: { position: "absolute", bottom: 20, left: 36, right: 36, flexDirection: "row", justifyContent: "space-between", fontSize: 7.5, color: "#737373" },
});

const text = (value: ReportValue) => (value === null || value === undefined || value === "" ? "--" : String(value));

function TablePdf({ table }: Readonly<{ table: ReportTable }>) {
  const total = table.columns.reduce((sum, c) => sum + (c.width ?? 1), 0);
  const widthOf = (w?: number) => `${((w ?? 1) / total) * 100}%`;

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{table.title}</Text>
      <View style={styles.table}>
        <View style={styles.headerRow} fixed>
          {table.columns.map((c) => (
            <Text key={c.key} style={[styles.headerCell, { width: widthOf(c.width), textAlign: c.align ?? "left" }]}>
              {c.label}
            </Text>
          ))}
        </View>
        {table.rows.length === 0 ? (
          <Text style={styles.empty}>No records.</Text>
        ) : (
          table.rows.map((row, index) => (
            <View key={index} style={styles.row} wrap={false}>
              {table.columns.map((c) => (
                <Text key={c.key} style={[styles.cell, { width: widthOf(c.width), textAlign: c.align ?? "left" }]}>
                  {text(row[c.key])}
                </Text>
              ))}
            </View>
          ))
        )}
      </View>
    </View>
  );
}

function MapPdf({ map }: Readonly<{ map: NonNullable<Report["map"]> }>) {
  const { drawing, legend, zeroFill } = map;
  const width = 300;
  const height = (drawing.height / drawing.width) * width;

  return (
    <View style={styles.mapRow} wrap={false}>
      <Svg width={width} height={height} viewBox={`0 0 ${drawing.width} ${drawing.height}`}>
        {drawing.shapes.map((shape, index) => (
          <Path
            key={index}
            d={shape.d}
            fill={shape.fill === "none" ? undefined : shape.fill}
            fillOpacity={shape.fill === "none" ? 0 : 1}
            stroke={shape.stroke}
            strokeWidth={shape.strokeWidth}
          />
        ))}
        {drawing.labels.map((label) => (
          <Text
            key={label.text}
            x={label.x}
            y={label.y}
            fill={label.fill}
            textAnchor="middle"
            style={{ fontSize: 13, fontFamily: "Helvetica-Bold" }}
          >
            {`${label.text} (${label.sub})`}
          </Text>
        ))}
      </Svg>
      {legend && (
        <View>
          <Text style={styles.legendTitle}>Legend (applicants)</Text>
          {[...legend].reverse().map((bin) => (
            <View key={bin.label} style={styles.legendItem}>
              <Svg width={10} height={10} style={{ marginRight: 6 }}>
                <Rect x={0} y={0} width={10} height={10} fill={bin.color} />
              </Svg>
              <Text>{bin.label}</Text>
            </View>
          ))}
          {zeroFill && (
            <View style={styles.legendItem}>
              <Svg width={10} height={10} style={{ marginRight: 6 }}>
                <Rect x={0} y={0} width={10} height={10} fill={zeroFill} />
              </Svg>
              <Text>None</Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

function ReportDocument({ report }: Readonly<{ report: Report }>) {
  const generated = new Date().toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" });
  return (
    <Document title={report.title} author="TANAW" creator="TANAW">
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>{report.title}</Text>
        {(report.meta ?? []).map((line) => (
          <Text key={line} style={styles.meta}>
            {line}
          </Text>
        ))}
        {report.map && <MapPdf map={report.map} />}
        {report.tables.map((table) => (
          <TablePdf key={table.title} table={table} />
        ))}
        {(report.notes ?? []).map((note) => (
          <Text key={note} style={styles.note}>
            {note}
          </Text>
        ))}
        <View style={styles.footer} fixed>
          <Text>TANAW · Quezon City University · Generated {generated}</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

export function reportToPdf(report: Report) {
  return renderToBuffer(<ReportDocument report={report} />);
}
