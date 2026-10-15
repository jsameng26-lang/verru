// AI가 쓴 마크다운을 블록으로 나눈다. 화면 표시와 .docx 저장이 같은 결과를 쓰도록 한 곳에서 해석한다.
// 지원: # 제목, 문단, - 목록, 1. 번호 목록, | 표 |, > 인용, ---, **굵게**

export type Run = { text: string; bold: boolean };
export type Block =
  | { kind: "heading"; level: 1 | 2 | 3; runs: Run[] }
  | { kind: "para"; runs: Run[] }
  | { kind: "list"; ordered: boolean; items: Run[][] }
  | { kind: "table"; header: Run[][]; rows: Run[][][] }
  | { kind: "quote"; runs: Run[] }
  | { kind: "hr" };

export function inline(text: string): Run[] {
  const runs: Run[] = [];
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  for (const part of parts) {
    if (!part) continue;
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      runs.push({ text: part.slice(2, -2), bold: true });
    } else {
      runs.push({ text: part.replace(/`/g, ""), bold: false });
    }
  }
  return runs.length ? runs : [{ text: "", bold: false }];
}

function cells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

const isTableRule = (line: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line);

export function parseMarkdown(src: string): Block[] {
  const lines = src.replace(/\r/g, "").split("\n");
  const blocks: Block[] = [];
  let para: string[] = [];

  const flush = () => {
    if (para.length) blocks.push({ kind: "para", runs: inline(para.join(" ")) });
    para = [];
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed || /^```/.test(trimmed)) {
      flush();
      continue;
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (heading) {
      flush();
      const level = Math.min(3, heading[1].length) as 1 | 2 | 3;
      blocks.push({ kind: "heading", level, runs: inline(heading[2]) });
      continue;
    }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      flush();
      blocks.push({ kind: "hr" });
      continue;
    }
    if (trimmed.startsWith("|") && i + 1 < lines.length && isTableRule(lines[i + 1])) {
      flush();
      const header = cells(trimmed).map(inline);
      const rows: Run[][][] = [];
      i += 2;
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        rows.push(cells(lines[i]).map(inline));
        i += 1;
      }
      i -= 1;
      blocks.push({ kind: "table", header, rows });
      continue;
    }
    const bullet = /^[-*•]\s+(.*)$/.exec(trimmed);
    const numbered = /^\d+[.)]\s+(.*)$/.exec(trimmed);
    if (bullet || numbered) {
      flush();
      const ordered = Boolean(numbered);
      const last = blocks[blocks.length - 1];
      const item = inline((bullet ?? numbered)![1]);
      if (last && last.kind === "list" && last.ordered === ordered) last.items.push(item);
      else blocks.push({ kind: "list", ordered, items: [item] });
      continue;
    }
    if (trimmed.startsWith(">")) {
      flush();
      blocks.push({ kind: "quote", runs: inline(trimmed.replace(/^>\s?/, "")) });
      continue;
    }
    // AI가 쓴 문서는 한 줄에 한 항목(원문 / 해석 …)이라 줄마다 문단으로 둔다
    para.push(trimmed);
    flush();
  }
  flush();
  return blocks;
}

const runsText = (runs: Run[]) => runs.map((r) => r.text).join("");

/** 카페·블로그에 그대로 붙여넣을 수 있게 마크다운 기호를 뺀 글 */
export function toPlainText(src: string): string {
  const out: string[] = [];
  for (const block of parseMarkdown(src)) {
    switch (block.kind) {
      case "heading":
        out.push((out.length ? "\n" : "") + runsText(block.runs));
        break;
      case "para":
      case "quote":
        out.push(runsText(block.runs));
        break;
      case "list":
        block.items.forEach((item, i) => out.push(`${block.ordered ? `${i + 1}.` : "·"} ${runsText(item)}`));
        break;
      case "table":
        out.push(block.header.map(runsText).join(" | "));
        for (const row of block.rows) out.push(row.map(runsText).join(" | "));
        break;
      case "hr":
        out.push("");
        break;
    }
  }
  return out.join("\n").trim();
}
