/**
 * Printable, scannable answer sheets (one page per applicant) built with
 * @react-pdf/renderer. Each page carries a QR code (identity), corner fiducial
 * marks and a side timing-mark column so a flatbed scan can later be aligned
 * and read automatically. The layout is fixed so the mark positions are known.
 */
import {
  Document,
  Font,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";
import QRCode from "qrcode";

Font.registerHyphenationCallback((word) => [word]);

const OPTIONS = ["A", "B", "C", "D"] as const;
const PER_COLUMN = 25;

export type AnswerSheetApplicant = {
  application_id: number;
  application_no: string;
  full_name: string;
  room: string | null;
  /** Exam set the applicant's session takes ("A" / "B"). */
  set: string;
};

export type AnswerSheetData = {
  examName: string;
  examDate: string | null;
  schoolYear: string;
  questionCount: number;
  applicants: (AnswerSheetApplicant & { qr: string })[];
};

/** Compact identity payload embedded in the QR and parsed back when scanning. */
export function answerSheetQrPayload(applicationNo: string, examId: number): string {
  return `TANAW;app:${applicationNo};exam:${examId}`;
}

const styles = StyleSheet.create({
  page: { paddingTop: 28, paddingBottom: 32, paddingHorizontal: 28, fontSize: 9, fontFamily: "Helvetica", color: "#111111" },
  fiducial: { position: "absolute", width: 14, height: 14, backgroundColor: "#000000" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 },
  examName: { fontSize: 14, fontFamily: "Helvetica-Bold" },
  meta: { fontSize: 9, color: "#444444", marginTop: 2 },
  idBox: { flexDirection: "row", alignItems: "center", gap: 8 },
  qr: { width: 64, height: 64 },
  idText: { fontSize: 9 },
  idName: { fontSize: 11, fontFamily: "Helvetica-Bold" },
  setLabel: { fontSize: 14, fontFamily: "Helvetica-Bold", marginTop: 2, letterSpacing: 1 },
  instructions: { fontSize: 8, color: "#444444", marginBottom: 8, borderTopWidth: 0.5, borderBottomWidth: 0.5, borderColor: "#999999", paddingVertical: 3 },
  body: { flexDirection: "row", gap: 14 },
  timingCol: { width: 10, flexDirection: "column", justifyContent: "flex-start" },
  timingMark: { width: 8, height: 8, backgroundColor: "#000000", marginBottom: 7.4 },
  columns: { flexDirection: "row", flexGrow: 1, gap: 12 },
  column: { flexDirection: "column", flexGrow: 1 },
  qRow: { flexDirection: "row", alignItems: "center", marginBottom: 3.5 },
  qNo: { width: 20, fontSize: 9, textAlign: "right", marginRight: 4, color: "#333333" },
  bubble: {
    width: 13,
    height: 13,
    borderRadius: 7,
    borderWidth: 0.8,
    borderColor: "#333333",
    marginRight: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  bubbleLetter: { fontSize: 6.5, color: "#555555" },
  footer: { position: "absolute", bottom: 14, left: 28, right: 28, fontSize: 7, color: "#888888", textAlign: "center" },
});

function Fiducials() {
  return (
    <>
      <View style={[styles.fiducial, { top: 10, left: 10 }]} />
      <View style={[styles.fiducial, { top: 10, right: 10 }]} />
      <View style={[styles.fiducial, { bottom: 10, left: 10 }]} />
      <View style={[styles.fiducial, { bottom: 10, right: 10 }]} />
    </>
  );
}

function QuestionRow({ no }: Readonly<{ no: number }>) {
  return (
    <View style={styles.qRow}>
      <Text style={styles.qNo}>{no}.</Text>
      {OPTIONS.map((opt) => (
        <View key={opt} style={styles.bubble}>
          <Text style={styles.bubbleLetter}>{opt}</Text>
        </View>
      ))}
    </View>
  );
}

function BubbleGrid({ count }: Readonly<{ count: number }>) {
  const columnCount = Math.max(1, Math.ceil(count / PER_COLUMN));
  const columns: number[][] = Array.from({ length: columnCount }, () => []);
  for (let n = 1; n <= count; n++) {
    columns[Math.floor((n - 1) / PER_COLUMN)].push(n);
  }
  // One timing mark per question row, aligned to the first column's rows.
  const timingMarks = Math.min(count, PER_COLUMN);

  return (
    <View style={styles.body}>
      <View style={styles.timingCol}>
        {Array.from({ length: timingMarks }, (_, i) => (
          <View key={i} style={styles.timingMark} />
        ))}
      </View>
      <View style={styles.columns}>
        {columns.map((nums, i) => (
          <View key={i} style={styles.column}>
            {nums.map((n) => (
              <QuestionRow key={n} no={n} />
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

function AnswerSheetPage({
  data,
  applicant,
  qrDataUrl,
}: Readonly<{
  data: AnswerSheetData;
  applicant: AnswerSheetApplicant;
  qrDataUrl: string;
}>) {
  return (
    <Page size="A4" style={styles.page}>
      <Fiducials />
      <View style={styles.header}>
        <View>
          <Text style={styles.examName}>{data.examName}</Text>
          <Text style={styles.meta}>
            S.Y. {data.schoolYear}
            {data.examDate ? `  ·  ${data.examDate}` : ""}
          </Text>
          <Text style={styles.meta}>{data.questionCount} items  ·  Options A–D</Text>
        </View>
        <View style={styles.idBox}>
          {/* eslint-disable-next-line jsx-a11y/alt-text */}
          <Image style={styles.qr} src={qrDataUrl} />
          <View>
            <Text style={styles.idName}>{applicant.full_name}</Text>
            <Text style={styles.idText}>No. {applicant.application_no}</Text>
            {applicant.room && <Text style={styles.idText}>Room: {applicant.room}</Text>}
            <Text style={styles.setLabel}>SET {applicant.set}</Text>
          </View>
        </View>
      </View>
      <Text style={styles.instructions}>
        Shade the circle of your answer completely using a black or blue ballpoint pen. Mark only one answer per
        item. Do not fold or crease this sheet, and keep the corner squares clean.
      </Text>
      <BubbleGrid count={data.questionCount} />
      <Text style={styles.footer} fixed>
        {applicant.application_no} · {data.examName}
      </Text>
    </Page>
  );
}

/** Renders the whole batch (one page per applicant) to a PDF buffer. */
export async function renderAnswerSheets(data: AnswerSheetData): Promise<Buffer> {
  const pages = await Promise.all(
    data.applicants.map(async (applicant) => ({
      applicant,
      qrDataUrl: await QRCode.toDataURL(applicant.qr, { margin: 0, width: 128 }),
    })),
  );

  return renderToBuffer(
    <Document title={`Answer sheets – ${data.examName}`}>
      {pages.map(({ applicant, qrDataUrl }) => (
        <AnswerSheetPage key={applicant.application_id} data={data} applicant={applicant} qrDataUrl={qrDataUrl} />
      ))}
    </Document>,
  );
}
