// 붙여넣은 글을 지문 단위로 나눈다.
// 지문 앞에 번호 줄을 두면 된다: "18번", "[19]", "20.", "3강 2번", "Exercise 1", "Gateway" 등.
// 지문 안의 한글 줄(문제 발문·해설)과 ①~⑤ 선택지 줄은 지문이 아니므로 빼고, 몇 줄 뺐는지 알려준다.

export type Passage = {
  /** 저장용 키 (p01, p02 …) */
  key: string;
  /** 화면·파일 이름에 쓰는 번호 (예: 18번) */
  label: string;
  text: string;
  words: number;
  /** 빼낸 한글·선택지 줄 수 */
  dropped: number;
};

const LABEL_ONLY =
  /^\s*[[(<【#]*\s*((?:\d{1,3}\s*(?:[-~]\s*\d{1,3}\s*)?번?)|(?:\d{1,2}\s*강\s*\d{1,2}\s*번?)|(?:(?:exercise|test|lesson|unit|ex|gateway|actual test|mini test)\.?\s*\d*[\w-]*))\s*[\])>】]*\s*[:.]?\s*$/i;
const LABEL_INLINE = /^\s*[[(]?(\d{1,3})\s*(?:번|[.)\]])\s+(?=["“'‘(A-Z])/;
const HANGUL = /[가-힣]/;
const CHOICE = /^\s*[①②③④⑤]/;

function normalizeLabel(raw: string) {
  const t = raw.replace(/\s+/g, " ").trim();
  if (/^\d{1,3}$/.test(t)) return `${t}번`;
  return t;
}

const countWords = (text: string) => (text.trim() ? text.trim().split(/\s+/).length : 0);

export function parsePassages(raw: string): Passage[] {
  const lines = raw.replace(/\r/g, "").split("\n");
  const groups: { label: string; lines: string[]; dropped: number }[] = [];
  let current: { label: string; lines: string[]; dropped: number } | null = null;

  const open = (label: string) => {
    current = { label: normalizeLabel(label), lines: [], dropped: 0 };
    groups.push(current);
  };

  for (const line of lines) {
    const only = LABEL_ONLY.exec(line);
    if (only && line.trim().length <= 30) {
      open(only[1]);
      continue;
    }
    const inline = LABEL_INLINE.exec(line);
    if (inline) {
      open(inline[1]);
      const rest = line.slice(inline[0].length);
      current!.lines.push(rest);
      continue;
    }
    if (!current) open("");
    if (!line.trim()) {
      current!.lines.push("");
      continue;
    }
    if (HANGUL.test(line) || CHOICE.test(line)) {
      current!.dropped += 1;
      continue;
    }
    current!.lines.push(line.trim());
  }

  const passages = groups
    .map((g) => ({ ...g, text: g.lines.join("\n").replace(/\n{3,}/g, "\n\n").trim() }))
    .filter((g) => countWords(g.text) > 0);

  return passages.map((g, i) => ({
    key: `p${String(i + 1).padStart(2, "0")}`,
    label: g.label || (passages.length === 1 ? "지문" : `지문 ${i + 1}`),
    text: g.text,
    words: countWords(g.text),
    dropped: g.dropped,
  }));
}
