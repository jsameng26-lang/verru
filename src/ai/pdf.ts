// 판매용 PDF 만들기 — 지문별 5종 PDF, 전 지문 통합 PDF, 전체 묶음 zip.
// 한글 글꼴(Pretendard, OFL)을 PDF에 넣어서 어떤 컴퓨터에서 열어도 똑같이 보인다.
// pdfmake 와 글꼴은 무거워서 처음 PDF를 만들 때만 불러온다.
import { COMPANY, STORAGE_LINK } from "../../company.config";
import { PART_META, SALE_PARTS, fileNameFor, slug, type PassageData, type RunData } from "./job";
import { parseMarkdown, type Run } from "./markdown";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Content = any;
type PdfMake = {
  addVirtualFileSystem(vfs: Record<string, string>): void;
  addFonts(fonts: Record<string, Record<string, string>>): void;
  setUrlAccessPolicy(fn: (url: string) => boolean): void;
  createPdf(doc: Content): { getBlob(): Promise<Blob> };
};

const INK = "#4a2b3c";
const PINK = "#c2457f";
const LINE = "#e6c9d6";
const SOFT = "#8a6076";
const BRAND = `${COMPANY.reportName} · ${STORAGE_LINK.replace(/^https?:\/\//, "")}`;

let loading: Promise<PdfMake> | null = null;

async function fontBase64(file: string) {
  const res = await fetch(new URL(`fonts/${file}`, document.baseURI));
  if (!res.ok) throw new Error(`글꼴을 불러오지 못했어요 (${file})`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

function loadPdfMake(): Promise<PdfMake> {
  loading ??= (async () => {
    const mod = (await import("pdfmake/build/pdfmake")) as any;
    const pdfMake: PdfMake = mod.default ?? mod;
    const [regular, bold] = await Promise.all([
      fontBase64("Pretendard-Regular.subset.ttf"),
      fontBase64("Pretendard-Bold.subset.ttf"),
    ]);
    pdfMake.addVirtualFileSystem({ "Pretendard-Regular.ttf": regular, "Pretendard-Bold.ttf": bold });
    pdfMake.addFonts({
      Pretendard: {
        normal: "Pretendard-Regular.ttf",
        bold: "Pretendard-Bold.ttf",
        italics: "Pretendard-Regular.ttf",
        bolditalics: "Pretendard-Bold.ttf",
      },
    });
    pdfMake.setUrlAccessPolicy(() => false);
    return pdfMake;
  })().catch((e) => {
    loading = null;
    throw e;
  });
  return loading;
}

const inline = (runs: Run[]) => runs.map((r) => (r.bold ? { text: r.text, bold: true } : r.text));
const runsText = (runs: Run[]) => runs.map((r) => r.text).join("");

const tableLayout = {
  hLineColor: () => LINE,
  vLineColor: () => LINE,
  hLineWidth: () => 0.6,
  vLineWidth: () => 0.6,
  paddingLeft: () => 5,
  paddingRight: () => 5,
  paddingTop: () => 3,
  paddingBottom: () => 3,
  fillColor: (row: number) => (row === 0 ? "#fdeef5" : null),
};

/** 마크다운 문서 하나 → pdfmake 내용. 첫 제목은 새 페이지에서 시작 */
function docContent(markdown: string, newPage: boolean): Content[] {
  const out: Content[] = [];
  let first = true;
  for (const block of parseMarkdown(markdown)) {
    switch (block.kind) {
      case "heading":
        out.push({
          text: inline(block.runs),
          style: `h${block.level}`,
          ...(first && newPage ? { pageBreak: "before" } : {}),
        });
        break;
      case "para":
        out.push({ text: inline(block.runs), margin: [0, 0, 0, 5] });
        break;
      case "quote":
        out.push({
          table: { widths: ["*"], body: [[{ text: inline(block.runs), color: SOFT }]] },
          layout: {
            hLineWidth: () => 0,
            vLineWidth: (i: number) => (i === 0 ? 2 : 0),
            vLineColor: () => "#ff8fc0",
            paddingLeft: () => 8,
          },
          margin: [0, 0, 0, 6],
        });
        break;
      case "list":
        out.push({
          [block.ordered ? "ol" : "ul"]: block.items.map((item) => ({ text: inline(item) })),
          margin: [0, 0, 0, 6],
        });
        break;
      case "table": {
        const cols = Math.max(block.header.length, ...block.rows.map((r) => r.length));
        const narrow = /^(번호|문항|항목|팀|지문)$/.test(runsText(block.header[0] ?? []).trim());
        const cell = (runs: Run[] | undefined, header: boolean) => ({ text: inline(runs ?? []), bold: header });
        out.push({
          table: {
            headerRows: 1,
            dontBreakRows: true,
            widths: Array.from({ length: cols }, (_, i) => (i === 0 && narrow ? "auto" : "*")),
            body: [
              Array.from({ length: cols }, (_, i) => cell(block.header[i], true)),
              ...block.rows.map((row) => Array.from({ length: cols }, (_, i) => cell(row[i], false))),
            ],
          },
          layout: tableLayout,
          fontSize: 8.5,
          margin: [0, 2, 0, 8],
        });
        break;
      }
      case "hr":
        out.push({
          canvas: [{ type: "line", x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 0.5, lineColor: LINE }],
          margin: [0, 4, 0, 8],
        });
        break;
    }
    first = false;
  }
  return out;
}

function baseDoc(title: string, header: string, content: Content[]) {
  return {
    info: { title, author: COMPANY.reportName, creator: BRAND },
    pageSize: "A4",
    pageMargins: [40, 46, 40, 46],
    header: (page: number) =>
      page === 1 ? null : { text: header, alignment: "right", fontSize: 7.5, color: SOFT, margin: [40, 20, 40, 0] },
    footer: (page: number, pages: number) => ({
      text: `${BRAND}   ${page} / ${pages}`,
      alignment: "center",
      fontSize: 7.5,
      color: SOFT,
      margin: [40, 14, 40, 0],
    }),
    defaultStyle: { font: "Pretendard", fontSize: 9.5, lineHeight: 1.35, color: INK },
    styles: {
      h1: { fontSize: 15, bold: true, margin: [0, 0, 0, 8] },
      h2: { fontSize: 11.5, bold: true, color: PINK, margin: [0, 10, 0, 4] },
      h3: { fontSize: 10, bold: true, margin: [0, 8, 0, 3] },
      cover: { fontSize: 22, bold: true, margin: [0, 160, 0, 10] },
      divider: { fontSize: 20, bold: true, color: PINK, margin: [0, 260, 0, 0], alignment: "center" },
    },
    content,
  };
}

async function render(doc: Content) {
  const pdfMake = await loadPdfMake();
  return pdfMake.createPdf(doc).getBlob();
}

const saleDocs = (p: PassageData) => SALE_PARTS.filter((id) => p.parts[id].status === "done" && p.parts[id].text);

/** 지문 하나의 5종 PDF */
export async function passagePdf(run: RunData, passage: PassageData): Promise<Blob> {
  const content = saleDocs(passage).flatMap((id, i) => docContent(passage.parts[id].text, i > 0));
  return render(baseDoc(`${run.productName} ${passage.label}`, `${run.productName} · ${passage.label}`, content));
}

/** 전 지문 통합 PDF — 표지·목차 → 분석지 전체 → 단어장 전체 → … (종류별로 묶어 출력하기 쉽게) */
export async function combinedPdf(run: RunData): Promise<Blob> {
  const ready = run.passages.filter((p) => saleDocs(p).length);
  const content: Content[] = [
    { text: run.productName, style: "cover" },
    { text: `${run.order.exam} · ${run.order.grade} · 지문 ${ready.length}개`, fontSize: 11, color: SOFT, margin: [0, 0, 0, 4] },
    { text: "분석지 · 단어장 · 워크북 · 변형문제 · 서술형 대비", fontSize: 11, color: SOFT, margin: [0, 0, 0, 30] },
    { toc: { title: { text: "목차", style: "h2" } } },
  ];
  for (const id of SALE_PARTS) {
    const withPart = ready.filter((p) => p.parts[id].status === "done" && p.parts[id].text);
    if (!withPart.length) continue;
    content.push({
      text: `${PART_META[id].title} — 전 지문`,
      style: "divider",
      pageBreak: "before",
      tocItem: true,
      tocStyle: { bold: true },
    });
    for (const p of withPart) {
      const blocks = docContent(p.parts[id].text, true);
      if (blocks[0]) blocks[0] = { ...blocks[0], tocItem: true, tocMargin: [14, 0, 0, 0], tocStyle: { fontSize: 8.5 } };
      content.push(...blocks);
    }
  }
  return render(baseDoc(run.productName, run.productName, content));
}

export function passagePdfName(run: RunData, p: PassageData) {
  return fileNameFor(run.order, `${slug(p.label)}_5종`, "pdf");
}

export function combinedPdfName(run: RunData) {
  return fileNameFor(run.order, "전지문_5종_통합", "pdf");
}

/** 지문별 PDF 전부 + 통합본을 zip 하나로 */
export async function bundleZip(run: RunData, onStep?: (done: number, total: number) => void): Promise<Blob> {
  const { zipSync } = await import("fflate");
  const ready = run.passages.filter((p) => saleDocs(p).length);
  const total = ready.length + 1;
  const files: Record<string, Uint8Array> = {};
  let done = 0;
  for (const p of ready) {
    files[passagePdfName(run, p)] = new Uint8Array(await (await passagePdf(run, p)).arrayBuffer());
    onStep?.(++done, total);
  }
  files[combinedPdfName(run)] = new Uint8Array(await (await combinedPdf(run)).arrayBuffer());
  onStep?.(++done, total);
  return new Blob([zipSync(files, { level: 0 }) as Uint8Array<ArrayBuffer>], { type: "application/zip" });
}
