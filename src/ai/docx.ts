// 결과물을 워드(.docx) 파일로 만든다. 한글(HWP)에서도 열린다.
import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import { parseMarkdown, type Run } from "./markdown";

const FONT = "맑은 고딕";
const LINE = { color: "B9A0AE", size: 4, style: BorderStyle.SINGLE } as const;

const textRuns = (runs: Run[], forceBold = false) =>
  runs.map((r) => new TextRun({ text: r.text, bold: r.bold || forceBold }));

function blocksToDocx(markdown: string, firstOnNewPage: boolean): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [];
  let first = true;
  for (const block of parseMarkdown(markdown)) {
    switch (block.kind) {
      case "heading": {
        const heading = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3][block.level - 1];
        out.push(
          new Paragraph({
            heading,
            children: textRuns(block.runs),
            pageBreakBefore: first && firstOnNewPage,
            spacing: { before: block.level === 1 ? 0 : 240, after: 120 },
          }),
        );
        break;
      }
      case "para":
        out.push(new Paragraph({ children: textRuns(block.runs), spacing: { after: 120, line: 320 } }));
        break;
      case "quote":
        out.push(
          new Paragraph({
            children: textRuns(block.runs),
            indent: { left: 360 },
            border: { left: { ...LINE, size: 12 } },
            spacing: { after: 120 },
          }),
        );
        break;
      case "list":
        block.items.forEach((item, i) =>
          out.push(
            new Paragraph({
              children: [new TextRun(block.ordered ? `${i + 1}. ` : "• "), ...textRuns(item)],
              indent: { left: 360, hanging: 240 },
              spacing: { after: 80, line: 300 },
            }),
          ),
        );
        break;
      case "table": {
        const cols = Math.max(block.header.length, ...block.rows.map((r) => r.length));
        const cell = (runs: Run[] | undefined, header: boolean) =>
          new TableCell({
            children: [new Paragraph({ children: textRuns(runs ?? [], header) })],
            shading: header ? { type: ShadingType.CLEAR, color: "auto", fill: "FFE6F2" } : undefined,
            margins: { top: 60, bottom: 60, left: 100, right: 100 },
          });
        const row = (runs: Run[][], header: boolean) =>
          new TableRow({
            tableHeader: header,
            children: Array.from({ length: cols }, (_, i) => cell(runs[i], header)),
          });
        out.push(
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: {
              top: LINE,
              bottom: LINE,
              left: LINE,
              right: LINE,
              insideHorizontal: LINE,
              insideVertical: LINE,
            },
            rows: [row(block.header, true), ...block.rows.map((r) => row(r, false))],
          }),
          new Paragraph({ children: [], spacing: { after: 120 } }),
        );
        break;
      }
      case "hr":
        out.push(new Paragraph({ children: [], border: { bottom: LINE }, spacing: { after: 160 } }));
        break;
    }
    first = false;
  }
  return out;
}

/** 여러 결과물을 한 파일로 (각 결과물은 새 페이지에서 시작) */
export async function buildDocx(parts: { markdown: string }[], footer: string): Promise<Blob> {
  const children = parts.flatMap((part, i) => blocksToDocx(part.markdown, i > 0));
  children.push(
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      spacing: { before: 480 },
      children: [new TextRun({ text: footer, color: "8A6076", size: 16 })],
    }),
  );
  const doc = new Document({
    creator: footer,
    styles: {
      default: { document: { run: { font: FONT, size: 21 } } },
      paragraphStyles: [
        { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", run: { font: FONT, size: 32, bold: true, color: "4A2B3C" } },
        { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", run: { font: FONT, size: 26, bold: true, color: "C2457F" } },
        { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", run: { font: FONT, size: 22, bold: true, color: "4A2B3C" } },
      ],
    },
    sections: [{ properties: { page: { margin: { top: 1000, bottom: 1000, left: 1000, right: 1000 } } }, children }],
  });
  return Packer.toBlob(doc);
}
