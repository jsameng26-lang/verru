// 지문 하나로 5종 세트 + 검수 + 상세페이지·홍보글 + 등록 정보를 실제로 만드는 작업 단위.
// 사무실 시뮬레이션(sim.ts)이 단계마다 run()을 부르고, 직원들은 결과가 나올 때까지 자리에서 일한다.
import { BLOCK_NEED, DEPT_LEAD } from "../game/staff";
import { roomOf } from "../game/world";
import { sampleErrorText, type SampleError, type SampleFn } from "./claude";
import {
  analysisPrompt,
  demandPrompt,
  detailPrompt,
  planPrompt,
  promoPrompt,
  qaPrompt,
  variantsPrompt,
  vocabPrompt,
  workbookPrompt,
  writingPrompt,
  type Plan,
  type WorkInput,
} from "./prompts";

export type SectionId =
  | "demand"
  | "plan"
  | "analysis"
  | "vocab"
  | "workbook"
  | "variants"
  | "writing"
  | "qa"
  | "detail"
  | "promo"
  | "listing"
  | "briefing";

export type SectionStatus = "idle" | "running" | "done" | "failed" | "skipped";

export type Section = {
  id: SectionId;
  status: SectionStatus;
  text: string;
  error: string;
  truncated: boolean;
};

type Meta = {
  dept: string;
  title: string;
  /** 판매용 자료(세트 .docx에 들어감) */
  sale: boolean;
  /** 진행률 계산용 예상 글자 수 */
  expected: number;
  tier: "quick" | "default" | "complex";
};

export const SECTION_META: Record<SectionId, Meta> = {
  demand: { dept: "research", title: "수요 메모 정리", sale: false, expected: 700, tier: "quick" },
  plan: { dept: "strategy1", title: "제작 계획", sale: false, expected: 700, tier: "default" },
  analysis: { dept: "strategy2", title: "분석지", sale: true, expected: 5000, tier: "default" },
  vocab: { dept: "strategy2", title: "단어장", sale: true, expected: 2600, tier: "default" },
  workbook: { dept: "reels", title: "워크북", sale: true, expected: 4500, tier: "default" },
  variants: { dept: "reels", title: "변형문제", sale: true, expected: 5000, tier: "complex" },
  writing: { dept: "carousel", title: "서술형 대비", sale: true, expected: 2600, tier: "default" },
  qa: { dept: "qa", title: "검수 보고서", sale: false, expected: 2200, tier: "complex" },
  detail: { dept: "review", title: "상세페이지 문구", sale: false, expected: 1800, tier: "default" },
  promo: { dept: "partner", title: "카페·블로그 홍보글", sale: false, expected: 2400, tier: "default" },
  listing: { dept: "ops", title: "상품 등록 정보", sale: false, expected: 1, tier: "quick" },
  briefing: { dept: "secretary", title: "비서실 브리핑", sale: false, expected: 1, tier: "quick" },
};

export const SECTION_ORDER: SectionId[] = [
  "demand",
  "plan",
  "analysis",
  "vocab",
  "workbook",
  "variants",
  "writing",
  "qa",
  "detail",
  "promo",
  "listing",
  "briefing",
];

export const SALE_SECTIONS: SectionId[] = SECTION_ORDER.filter((id) => SECTION_META[id].sale);

/** 저장소·화면에 넘기는 작업 상태 (읽기 전용 사본) */
export type RunData = {
  id: string;
  createdAt: number;
  input: WorkInput;
  plan: Plan | null;
  productName: string;
  sections: Record<SectionId, Section>;
  /** 시트에 붙여넣을 한 줄 (탭 구분) */
  sheetRow: string;
};

export type RunSaver = (run: RunData) => void;

function emptySections(): Record<SectionId, Section> {
  return Object.fromEntries(
    SECTION_ORDER.map((id) => [id, { id, status: "idle", text: "", error: "", truncated: false }]),
  ) as Record<SectionId, Section>;
}

function planToMarkdown(plan: Plan) {
  return [
    `# 제작 계획 — ${plan.productName}`,
    "",
    "| 항목 | 내용 |",
    "|---|---|",
    `| 상품명 | ${plan.productName} |`,
    `| 주제 | ${plan.topic} |`,
    `| 요지 | ${plan.gist} |`,
    `| 난이도 | ${plan.difficulty} |`,
    "",
    "## 출제 포인트",
    ...plan.points.map((p) => `- ${p}`),
    "",
    "## 핵심 문장",
    ...plan.keySentences.map((s) => `- ${s}`),
    "",
    "## 판매 포인트",
    plan.summary,
  ].join("\n");
}

function cleanPlan(raw: unknown): Plan | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const list = (v: unknown) => (Array.isArray(v) ? v.map(str).filter(Boolean) : []);
  const plan: Plan = {
    productName: str(r.productName),
    topic: str(r.topic),
    gist: str(r.gist),
    difficulty: str(r.difficulty) || "중",
    keySentences: list(r.keySentences).slice(0, 3),
    points: list(r.points).slice(0, 3),
    summary: str(r.summary),
  };
  return plan.productName ? plan : null;
}

const slug = (s: string) => s.replace(/[^0-9A-Za-z가-힣]+/g, "").slice(0, 20) || "지문";

/** 저장 파일 이름 — 예: VR_고2_2026년10월학평_18번_분석지.docx */
export function fileNameFor(input: WorkInput, part: string) {
  return `VR_${slug(input.grade)}_${slug(input.exam)}_${slug(input.number)}_${part}.docx`;
}

export class WorkJob {
  readonly id: string;
  readonly createdAt: number;
  readonly input: WorkInput;
  sections = emptySections();
  plan: Plan | null = null;
  private startedAt = new Map<SectionId, number>();
  private running = new Map<SectionId, Promise<void>>();
  private controllers = new Set<AbortController>();
  private sample: SampleFn | null;
  private save: RunSaver | null;

  constructor(input: WorkInput, sample: SampleFn | null, save: RunSaver | null) {
    this.createdAt = Date.now();
    this.id = `run-${this.createdAt}`;
    this.input = input;
    this.sample = sample;
    this.save = save;
  }

  get hasMemo() {
    return this.input.memo.trim().length > 0;
  }

  productName() {
    const { exam, number, grade } = this.input;
    return this.plan?.productName || [exam, number, grade, "영어 지문 5종 세트"].filter(Boolean).join(" ");
  }

  section(id: SectionId) {
    return this.sections[id];
  }

  isSettled(id: SectionId) {
    const s = this.sections[id].status;
    return s === "done" || s === "failed" || s === "skipped";
  }

  /** 0~1. 글이 나오기 전(생각 중)에는 시간에 따라 천천히, 나오면 글자 수 기준 */
  progress(id: SectionId) {
    const s = this.sections[id];
    if (this.isSettled(id)) return 1;
    if (s.status !== "running") return 0;
    if (!s.text) {
      const waited = (Date.now() - (this.startedAt.get(id) ?? Date.now())) / 1000;
      return Math.min(0.3, (waited / 90) * 0.3);
    }
    return 0.3 + 0.67 * Math.min(1, s.text.length / SECTION_META[id].expected);
  }

  pending() {
    return this.running.size;
  }

  skip(id: SectionId, reason: string) {
    this.sections[id] = { ...this.sections[id], status: "skipped", error: reason };
    this.persist();
  }

  /** 이미 돌고 있거나 끝났으면 다시 부르지 않는다. 다시 만들기는 rerun() */
  run(id: SectionId): Promise<void> {
    const live = this.running.get(id);
    if (live) return live;
    if (this.sections[id].status !== "idle") return Promise.resolve();
    return this.start(id, true);
  }

  rerun(id: SectionId): Promise<void> {
    const live = this.running.get(id);
    if (live) return live;
    return this.start(id, false);
  }

  cancel() {
    for (const ctl of this.controllers) ctl.abort();
  }

  private start(id: SectionId, cache: boolean): Promise<void> {
    this.sections[id] = { id, status: "running", text: "", error: "", truncated: false };
    this.startedAt.set(id, Date.now());
    const work = this.execute(id, cache).finally(() => {
      this.running.delete(id);
      this.persist();
    });
    this.running.set(id, work);
    return work;
  }

  private set(id: SectionId, patch: Partial<Section>) {
    this.sections[id] = { ...this.sections[id], ...patch };
  }

  private async execute(id: SectionId, cache: boolean) {
    if (id === "listing") {
      this.set(id, { status: "done", text: this.listingMarkdown() });
      return;
    }
    if (id === "briefing") {
      this.set(id, { status: "done", text: this.briefingMarkdown() });
      return;
    }
    if (!this.sample) {
      this.set(id, { status: "failed", error: "AI 연결이 없는 화면이에요. Claude에서 이 페이지를 열어주세요." });
      return;
    }

    const ctl = new AbortController();
    this.controllers.add(ctl);
    const options = {
      signal: ctl.signal,
      modelTier: SECTION_META[id].tier,
      cache,
      onText: ({ text }: { text: string }) => this.set(id, { text }),
    };
    try {
      if (id === "plan") {
        const raw = await this.sample.json(planPrompt(this.input, this.text("demand")), options);
        const plan = cleanPlan(raw);
        if (!plan) throw { code: "invalid_json", message: "plan missing fields" } satisfies SampleError;
        this.plan = plan;
        this.set(id, { status: "done", text: planToMarkdown(plan) });
        return;
      }
      const { text, truncated } = await this.sample(this.prompt(id), options);
      this.set(id, { status: "done", text, truncated });
    } catch (e) {
      const err = e as SampleError;
      const partial = typeof err?.text === "string" && id !== "plan" ? err.text : "";
      this.set(id, { status: "failed", text: partial, error: sampleErrorText(err?.code ?? "upstream_error") });
    } finally {
      this.controllers.delete(ctl);
    }
  }

  private text(id: SectionId) {
    const s = this.sections[id];
    return s.status === "done" ? s.text : "";
  }

  private prompt(id: SectionId): string {
    const name = this.productName();
    const { input, plan } = this;
    switch (id) {
      case "demand":
        return demandPrompt(input);
      case "analysis":
        return analysisPrompt(input, plan, name);
      case "vocab":
        return vocabPrompt(input, name);
      case "workbook":
        return workbookPrompt(input, plan, name);
      case "variants":
        return variantsPrompt(input, plan, name);
      case "writing":
        return writingPrompt(input, plan, name);
      case "qa":
        return qaPrompt(input, name, {
          workbook: this.text("workbook"),
          variants: this.text("variants"),
          writing: this.text("writing"),
        });
      case "detail":
        return detailPrompt(input, plan, name);
      case "promo":
        return promoPrompt(input, plan, name, this.text("demand"));
      default:
        throw new Error(`no prompt for ${id}`);
    }
  }

  // ── AI 없이 만드는 결과물 ─────────────────────────────────
  productCode() {
    const d = new Date(this.createdAt);
    const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
    return `VR-${slug(this.input.grade)}-${slug(this.input.exam)}-${slug(this.input.number)}-${ymd}`;
  }

  fileName(part: string) {
    return fileNameFor(this.input, part);
  }

  sheetRow() {
    const d = new Date(this.createdAt).toISOString().slice(0, 10);
    return [
      this.productCode(),
      this.productName(),
      this.input.grade,
      this.input.exam,
      this.input.number,
      "분석지·단어장·워크북·변형문제·서술형",
      "",
      d,
    ].join("\t");
  }

  private listingMarkdown() {
    const name = this.productName();
    const qa = this.qaVerdict();
    return [
      `# 상품 등록 정보 — ${name}`,
      "",
      "| 항목 | 내용 |",
      "|---|---|",
      `| 상품 코드 | ${this.productCode()} |`,
      `| 상품명 | ${name} |`,
      `| 대상 | ${this.input.grade} |`,
      `| 시험/교재 | ${this.input.exam || "—"} |`,
      `| 문항 | ${this.input.number || "—"} |`,
      "| 구성 | 분석지 · 단어장 · 워크북 · 변형문제 5문항 · 서술형 4문항 |",
      "| 가격 | [대표 입력] |",
      `| 검수 판정 | ${qa || "검수 보고서 확인 필요"} |`,
      "",
      "## 파일 이름",
      ...SALE_SECTIONS.map((id) => `- ${this.fileName(SECTION_META[id].title.replace(/\s/g, ""))}`),
      `- ${this.fileName("전체세트")}`,
      "",
      "## 스프레드시트에 붙여넣기",
      "- '시트용 한 줄 복사'를 누르면 아래 순서로 복사돼요: 상품 코드 · 상품명 · 대상 · 시험 · 문항 · 구성 · 가격 · 등록일",
      "- 가격 칸은 비어 있어요. 시트에서 직접 넣어주세요.",
    ].join("\n");
  }

  private qaVerdict() {
    const match = /최종 판정[^\n]*?:\s*\**([^\n*]+)/.exec(this.text("qa"));
    return match?.[1]?.trim() ?? "";
  }

  private briefingMarkdown() {
    const today = new Date().toLocaleDateString("ko-KR");
    const rows = SECTION_ORDER.filter((id) => id !== "briefing").map((id) => {
      const s = this.sections[id];
      const team = roomOf(SECTION_META[id].dept).name;
      const state =
        s.status === "done"
          ? s.truncated
            ? "완료 (길어서 일부 잘림)"
            : "완료"
          : s.status === "failed"
            ? `실패 — ${s.error}`
            : s.status === "skipped"
              ? `건너뜀 — ${s.error}`
              : "대기";
      return `| ${team} | ${SECTION_META[id].title} | ${state} |`;
    });
    const qaSummary = (/## 요약\n([\s\S]*?)(\n## |$)/.exec(this.text("qa"))?.[1] ?? "").trim();
    const failed = SECTION_ORDER.filter((id) => this.sections[id].status === "failed").map((id) => SECTION_META[id].title);
    const resting = Object.entries(BLOCK_NEED).map(([dept, need]) => `- ${roomOf(dept).name}: ${need} 전이라 오늘은 쉬었어요.`);
    return [
      `# 비서실 브리핑 — ${today}`,
      "",
      `${DEPT_LEAD.secretary.name} 비서실장이 정리했어요. 상품: **${this.productName()}**`,
      "",
      "## 오늘 만든 자료",
      "| 팀 | 결과물 | 상태 |",
      "|---|---|---|",
      ...rows,
      "",
      "## 검수 의견",
      qaSummary || "- 검수 보고서가 없어요. 검수팀 결과를 확인해주세요.",
      "",
      "## 대표님이 하실 일",
      ...(failed.length ? [`1. 실패한 자료 다시 만들기: ${failed.join(", ")}`] : []),
      `${failed.length ? 2 : 1}. 검수 보고서의 수정 제안 확인`,
      `${failed.length ? 3 : 2}. 판매 사이트 관리자페이지에 파일 업로드 (자료관리팀 등록 정보 참고)`,
      `${failed.length ? 4 : 3}. 황영카·기출비 카페와 블로그에 홍보글 게시 + 견본 PDF 첨부`,
      "",
      ...(resting.length ? ["## 쉬는 팀", ...resting] : []),
    ].join("\n");
  }

  // ── 저장 ────────────────────────────────────────────────
  data(): RunData {
    return {
      id: this.id,
      createdAt: this.createdAt,
      input: this.input,
      plan: this.plan,
      productName: this.productName(),
      sections: { ...this.sections },
      sheetRow: this.sheetRow(),
    };
  }

  private persist() {
    this.save?.(this.data());
  }
}
