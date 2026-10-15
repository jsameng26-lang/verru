// 전 지문 5종 세트를 실제로 만드는 작업 단위.
// 지문마다 분석지·단어장·워크북·변형문제·서술형 + 검수를 만들고, 세트 전체로 기획·상세페이지·홍보글·등록 정보·브리핑을 만든다.
// 사무실 시뮬레이션(sim.ts)이 단계마다 일을 맡기고, 직원들은 결과가 나올 때까지 자리에서 일한다.
import { BLOCK_NEED, DEPT_LEAD } from "../game/staff";
import { roomOf } from "../game/world";
import { sampleErrorText, type SampleError, type SampleFn } from "./claude";
import type { Passage } from "./passages";
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
  type SetInfo,
  type WorkInput,
} from "./prompts";

export type OrderInput = { exam: string; grade: string; passages: string; memo: string };

export type GlobalId = "demand" | "plan" | "detail" | "promo" | "listing" | "briefing";
export type PartId = "analysis" | "vocab" | "workbook" | "variants" | "writing" | "qa";
export type SectionStatus = "idle" | "running" | "done" | "failed" | "skipped";

export type Section = { status: SectionStatus; text: string; error: string; truncated: boolean };

type Tier = "quick" | "default" | "complex";
type Meta = { dept: string; title: string; expected: number; tier: Tier };
type Answer = { text: string; truncated: boolean };

export const GLOBAL_META: Record<GlobalId, Meta> = {
  demand: { dept: "research", title: "수요 메모 정리", expected: 700, tier: "quick" },
  plan: { dept: "strategy1", title: "제작 계획", expected: 1500, tier: "default" },
  detail: { dept: "review", title: "상세페이지 문구", expected: 1800, tier: "default" },
  promo: { dept: "partner", title: "카페·블로그 홍보글", expected: 2400, tier: "default" },
  listing: { dept: "ops", title: "상품 등록 정보", expected: 1, tier: "quick" },
  briefing: { dept: "secretary", title: "비서실 브리핑", expected: 1, tier: "quick" },
};

export const PART_META: Record<PartId, Meta> = {
  analysis: { dept: "strategy2", title: "분석지", expected: 5000, tier: "default" },
  vocab: { dept: "strategy2", title: "단어장", expected: 2600, tier: "default" },
  workbook: { dept: "reels", title: "워크북", expected: 4500, tier: "default" },
  variants: { dept: "reels", title: "변형문제", expected: 5000, tier: "complex" },
  writing: { dept: "carousel", title: "서술형 대비", expected: 2600, tier: "default" },
  qa: { dept: "qa", title: "검수 보고서", expected: 2200, tier: "complex" },
};

export const GLOBAL_ORDER: GlobalId[] = ["demand", "plan", "detail", "promo", "listing", "briefing"];
export const PART_ORDER: PartId[] = ["analysis", "vocab", "workbook", "variants", "writing", "qa"];
/** 고객에게 파는 5종 (PDF에 들어가는 순서) */
export const SALE_PARTS: PartId[] = ["analysis", "vocab", "workbook", "variants", "writing"];

export type PassageData = { key: string; label: string; text: string; parts: Record<PartId, Section> };

export type RunData = {
  version: 2;
  id: string;
  createdAt: number;
  order: OrderInput;
  plan: Plan | null;
  productName: string;
  global: Record<GlobalId, Section>;
  passages: PassageData[];
  /** AI 사용이 막혀 중간에 멈췄으면 그 이유 */
  halted: string;
  sheetRow: string;
};

export type RunSaver = {
  saveRun(run: RunData): void;
  savePassage(runId: string, passage: PassageData): void;
};

const empty = (): Section => ({ status: "idle", text: "", error: "", truncated: false });
const emptyParts = () => Object.fromEntries(PART_ORDER.map((id) => [id, empty()])) as Record<PartId, Section>;
export const isSettled = (s: Section) => s.status === "done" || s.status === "failed" || s.status === "skipped";

/** 다시 눌러도 바로는 소용없는 실패 — 줄을 멈추고 대표에게 알린다 */
const HALT_CODES = new Set(["rate_limited", "not_granted", "sampling_disabled", "session_expired", "not_declared"]);

export /** 줄을 멈춘 이유 — 대표에게 보여줄 문장 */
function haltText(code: string) {
  switch (code) {
    case "rate_limited":
      return "AI 사용량 한도에 걸려서 잠시 멈췄어요. 한도가 풀린 뒤(보통 몇 시간 안) 이어서 만들 수 있어요.";
    case "not_granted":
      return "AI 사용 허락이 꺼져 있어서 멈췄어요. 페이지 권한 메뉴에서 켜고 이어서 만들어주세요.";
    case "session_expired":
      return "로그인이 만료돼서 멈췄어요. 다시 로그인한 뒤 이어서 만들어주세요.";
    default:
      return "이 계정에선 AI 작업을 쓸 수 없어서 멈췄어요.";
  }
}

export const slug = (s: string) => s.replace(/[^0-9A-Za-z가-힣]+/g, "").slice(0, 24) || "자료";

/** 저장 파일 이름 — 예: VR_고2_2026년10월학평_18번_5종.pdf */
export function fileNameFor(order: OrderInput, part: string, ext: "pdf" | "docx" | "zip") {
  return `VR_${slug(order.grade)}_${slug(order.exam)}_${part}.${ext}`;
}

/** 동시에 최대 limit 개만 돌리는 줄 (AI는 한 사람당 동시에 두어 개만 받는다) */
class Lane {
  private active = 0;
  private waiting: (() => void)[] = [];
  constructor(private limit: number) {}
  async run(task: () => Promise<void>) {
    if (this.active >= this.limit) await new Promise<void>((resolve) => this.waiting.push(resolve));
    this.active += 1;
    try {
      await task();
    } finally {
      this.active -= 1;
      this.waiting.shift()?.();
    }
  }
}

function cleanPlan(raw: unknown, labels: string[]): Plan | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const topicsRaw = Array.isArray(r.topics) ? (r.topics as Record<string, unknown>[]) : [];
  const plan: Plan = {
    productName: str(r.productName),
    difficulty: str(r.difficulty) || "중",
    points: (Array.isArray(r.points) ? r.points.map(str).filter(Boolean) : []).slice(0, 3),
    summary: str(r.summary),
    topics: labels.map((label, i) => ({ label, topic: str(topicsRaw[i]?.topic) })),
  };
  return plan.productName ? plan : null;
}

function planToMarkdown(plan: Plan) {
  return [
    `# 제작 계획 — ${plan.productName}`,
    "",
    "| 항목 | 내용 |",
    "|---|---|",
    `| 상품명 | ${plan.productName} |`,
    `| 지문 수 | ${plan.topics.length}개 |`,
    `| 난이도 | ${plan.difficulty} |`,
    "",
    "## 출제 포인트",
    ...plan.points.map((p) => `- ${p}`),
    "",
    "## 판매 포인트",
    plan.summary,
    "",
    "## 지문별 주제",
    "| 지문 | 주제 |",
    "|---|---|",
    ...plan.topics.map((t) => `| ${t.label} | ${t.topic || "—"} |`),
  ].join("\n");
}

export class WorkJob {
  readonly id: string;
  readonly createdAt: number;
  readonly order: OrderInput;
  readonly passages: PassageData[];
  global = Object.fromEntries(GLOBAL_ORDER.map((id) => [id, empty()])) as Record<GlobalId, Section>;
  plan: Plan | null = null;
  halted = "";
  /** 이어서 만드는 세트인데 이미 제작에 들어갔던 것 — 대표 승인을 다시 묻지 않는다 */
  readonly approvedBefore: boolean;
  private lane = new Lane(2);
  private running = 0;
  private controllers = new Set<AbortController>();
  private sample: SampleFn | null;
  private saver: RunSaver | null;

  constructor(order: OrderInput, passages: Passage[], sample: SampleFn | null, saver: RunSaver | null, restore?: RunData) {
    this.createdAt = restore?.createdAt ?? Date.now();
    this.id = restore?.id ?? `run-${this.createdAt}`;
    this.order = order;
    this.sample = sample;
    this.saver = saver;
    this.passages =
      restore?.passages.map((p) => ({ ...p, parts: { ...emptyParts(), ...p.parts } })) ??
      passages.map((p) => ({ key: p.key, label: p.label, text: p.text, parts: emptyParts() }));
    this.approvedBefore = Boolean(restore?.passages.some((p) => PART_ORDER.some((id) => p.parts[id].status !== "idle")));
    if (restore) {
      this.global = { ...this.global, ...restore.global };
      this.plan = restore.plan;
      // 저장될 때 '작성 중'이던 것은 끊긴 것이고, 실패한 것도 이어서 만들 때 다시 시도한다
      const retry = (sec: Section) => sec.status === "running" || sec.status === "failed";
      for (const id of GLOBAL_ORDER) if (retry(this.global[id])) this.global[id] = empty();
      for (const p of this.passages) for (const id of PART_ORDER) if (retry(p.parts[id])) p.parts[id] = empty();
    }
  }

  /** 저장된 세트를 이어서 만들 때 */
  static restore(run: RunData, sample: SampleFn | null, saver: RunSaver | null) {
    return new WorkJob(run.order, [], sample, saver, run);
  }

  /** 이 세트에 AI 작업이 몇 번 필요한지 (대표 안내용) */
  static estimateCalls(count: number, memo: boolean) {
    return count * PART_ORDER.length + 3 + (memo ? 1 : 0);
  }

  get hasMemo() {
    return this.order.memo.trim().length > 0;
  }

  get count() {
    return this.passages.length;
  }

  productName() {
    return this.plan?.productName || [this.order.exam, this.order.grade, "전 지문 5종 세트"].filter(Boolean).join(" ");
  }

  pending() {
    return this.running;
  }

  // ── 세트 전체 결과물 ──────────────────────────────────────
  globalSettled(id: GlobalId) {
    return isSettled(this.global[id]) || (this.halted !== "" && this.global[id].status === "idle");
  }

  skip(id: GlobalId, reason: string) {
    this.global[id] = { ...empty(), status: "skipped", error: reason };
    this.persistRun();
  }

  runGlobal(id: GlobalId, force = false): Promise<void> {
    const status = this.global[id].status;
    if (status === "running") return Promise.resolve();
    if (!force && status !== "idle") return Promise.resolve();
    const ai = id !== "listing" && id !== "briefing";
    return this.execute((patch) => this.patchGlobal(id, patch), (cache) => this.globalCall(id, cache), !force, ai);
  }

  // ── 지문별 결과물 ─────────────────────────────────────────
  partsSettled(parts: PartId[]) {
    return this.passages.every((p) =>
      parts.every((id) => isSettled(p.parts[id]) || (this.halted !== "" && p.parts[id].status === "idle")),
    );
  }

  partsProgress(parts: PartId[]) {
    let sum = 0;
    for (const p of this.passages)
      for (const id of parts) {
        const sec = p.parts[id];
        if (isSettled(sec)) sum += 1;
        else if (sec.status === "running")
          sum += sec.text ? 0.3 + 0.6 * Math.min(1, sec.text.length / PART_META[id].expected) : 0.1;
      }
    return sum / Math.max(1, this.passages.length * parts.length);
  }

  partCount(id: PartId, status: SectionStatus) {
    return this.passages.filter((p) => p.parts[id].status === status).length;
  }

  /** 아직 안 만든 지문만 줄 세운다 (실패한 건 force 일 때만 다시). 모두 끝나면 resolve */
  runParts(parts: PartId[], force = false): Promise<void> {
    const work: Promise<void>[] = [];
    for (const p of this.passages)
      for (const id of parts) {
        const status = p.parts[id].status;
        if (status === "running" || status === "done" || status === "skipped") continue;
        if (status === "failed" && !force) continue;
        work.push(this.runPart(p.key, id, force));
      }
    return Promise.all(work).then(() => undefined);
  }

  runPart(key: string, id: PartId, force = false): Promise<void> {
    const p = this.passages.find((x) => x.key === key);
    if (!p || p.parts[id].status === "running") return Promise.resolve();
    return this.execute((patch) => this.patchPart(p, id, patch), (cache) => this.partCall(p, id, cache), !force, true);
  }

  // ── 실행 ────────────────────────────────────────────────
  private async execute(
    patch: (s: Partial<Section>) => void,
    call: (cache: boolean) => Promise<Answer>,
    cache: boolean,
    ai: boolean,
  ) {
    if (!ai) {
      // 등록 정보·브리핑은 AI 없이 바로 계산 — 멈춘 뒤에도 정리는 한다
      patch({ ...empty(), ...(await call(cache)), status: "done" });
      return;
    }
    this.running += 1;
    try {
      await this.lane.run(async () => {
        if (this.halted) return; // 줄 서 있는 동안 멈췄으면 손대지 않는다
        patch({ ...empty(), status: "running" });
        try {
          const result = await call(cache);
          patch({ status: "done", text: result.text, truncated: result.truncated, error: "" });
        } catch (e) {
          const err = e as SampleError;
          const code = err?.code ?? "upstream_error";
          if (HALT_CODES.has(code)) this.halted = haltText(code);
          patch({ status: "failed", text: typeof err?.text === "string" ? err.text : "", error: sampleErrorText(code) });
        }
      });
    } finally {
      this.running -= 1;
    }
  }

  private async ask(prompt: string, tier: Tier, cache: boolean, onText: (t: string) => void, json = false) {
    if (!this.sample) throw { code: "not_declared", message: "no sample" } satisfies SampleError;
    const ctl = new AbortController();
    this.controllers.add(ctl);
    const opts = { signal: ctl.signal, modelTier: tier, cache, onText: ({ text }: { text: string }) => onText(text) };
    try {
      if (json) return { value: await this.sample.json(prompt, opts), text: "", truncated: false };
      const { text, truncated } = await this.sample(prompt, opts);
      return { value: null, text, truncated };
    } finally {
      this.controllers.delete(ctl);
    }
  }

  private async globalCall(id: GlobalId, cache: boolean): Promise<Answer> {
    const live = (text: string) => this.patchGlobal(id, { text }, false);
    const tier = GLOBAL_META[id].tier;
    switch (id) {
      case "listing":
        return { text: this.listingMarkdown(), truncated: false };
      case "briefing":
        return { text: this.briefingMarkdown(), truncated: false };
      case "demand":
        return this.ask(demandPrompt(this.setInput()), tier, cache, live);
      case "plan": {
        const labels = this.passages.map((p) => p.label);
        const prompt = planPrompt(this.order.exam, this.order.grade, this.passagesForPrompt(), this.globalText("demand"));
        const { value } = await this.ask(prompt, tier, cache, () => undefined, true);
        const plan = cleanPlan(value, labels);
        if (!plan) throw { code: "invalid_json", message: "plan missing fields" } satisfies SampleError;
        this.plan = plan;
        return { text: planToMarkdown(plan), truncated: false };
      }
      case "detail":
        return this.ask(detailPrompt(this.setInfo()), tier, cache, live);
      case "promo":
        return this.ask(promoPrompt(this.setInfo(), this.globalText("demand")), tier, cache, live);
    }
  }

  private partCall(p: PassageData, id: PartId, cache: boolean): Promise<Answer> {
    const input: WorkInput = { exam: this.order.exam, number: p.label, grade: this.order.grade, passage: p.text, memo: "" };
    const topic = this.plan?.topics.find((t) => t.label === p.label)?.topic ?? "";
    const name = `${this.productName()} · ${p.label}`;
    const prompt =
      id === "analysis"
        ? analysisPrompt(input, topic, name)
        : id === "vocab"
          ? vocabPrompt(input, name)
          : id === "workbook"
            ? workbookPrompt(input, topic, name)
            : id === "variants"
              ? variantsPrompt(input, topic, name)
              : id === "writing"
                ? writingPrompt(input, topic, name)
                : qaPrompt(input, name, {
                    workbook: this.partText(p, "workbook"),
                    variants: this.partText(p, "variants"),
                    writing: this.partText(p, "writing"),
                  });
    return this.ask(prompt, PART_META[id].tier, cache, (text) => this.patchPart(p, id, { text }, false));
  }

  cancel() {
    for (const ctl of this.controllers) ctl.abort();
  }

  /** 멈춘 작업을 다시 이어서 할 수 있게 */
  clearHalt() {
    this.halted = "";
    this.persistRun();
  }

  /** 남은 일을 전부 순서대로 (결과물 창고의 '이어서 만들기') */
  async finishRemaining() {
    this.clearHalt();
    if (this.hasMemo) await this.runGlobal("demand");
    await this.runGlobal("plan");
    await this.runParts(["analysis", "vocab", "workbook", "variants", "writing"]);
    await this.runParts(["qa"]);
    await Promise.all([this.runGlobal("detail"), this.runGlobal("promo")]);
    await this.runGlobal("listing", true);
    await this.runGlobal("briefing", true);
  }

  // ── 상태 갱신 · 저장 ───────────────────────────────────────
  private patchGlobal(id: GlobalId, patch: Partial<Section>, save = true) {
    this.global = { ...this.global, [id]: { ...this.global[id], ...patch } };
    if (save) this.persistRun();
  }

  private patchPart(p: PassageData, id: PartId, patch: Partial<Section>, save = true) {
    p.parts = { ...p.parts, [id]: { ...p.parts[id], ...patch } };
    if (save) {
      this.saver?.savePassage(this.id, p);
      this.persistRun();
    }
  }

  private globalText(id: GlobalId) {
    return this.global[id].status === "done" ? this.global[id].text : "";
  }

  private partText(p: PassageData, id: PartId) {
    return p.parts[id].status === "done" ? p.parts[id].text : "";
  }

  private passagesForPrompt(): Passage[] {
    return this.passages.map((p) => ({ key: p.key, label: p.label, text: p.text, words: 0, dropped: 0 }));
  }

  private setInput(): WorkInput {
    return {
      exam: this.order.exam,
      number: `전 지문 ${this.count}개`,
      grade: this.order.grade,
      passage: "",
      memo: this.order.memo,
    };
  }

  private setInfo(): SetInfo {
    return {
      exam: this.order.exam,
      grade: this.order.grade,
      name: this.productName(),
      plan: this.plan,
      labels: this.passages.map((p) => p.label),
    };
  }

  // ── AI 없이 만드는 결과물 ─────────────────────────────────
  productCode() {
    const d = new Date(this.createdAt);
    const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
    return `VR-${slug(this.order.grade)}-${slug(this.order.exam)}-${ymd}`;
  }

  sheetRow() {
    return [
      this.productCode(),
      this.productName(),
      this.order.grade,
      this.order.exam,
      `${this.count}지문`,
      "분석지·단어장·워크북·변형문제·서술형 (PDF)",
      "",
      new Date(this.createdAt).toISOString().slice(0, 10),
    ].join("\t");
  }

  private verdicts() {
    let ok = 0;
    let fix = 0;
    for (const p of this.passages) {
      const match = /최종 판정[^\n]*?:\s*\**([^\n*]+)/.exec(this.partText(p, "qa"));
      if (!match) continue;
      if (/수정/.test(match[1])) fix += 1;
      else ok += 1;
    }
    return { ok, fix };
  }

  private listingMarkdown() {
    const name = this.productName();
    const { ok, fix } = this.verdicts();
    const first = this.passages[0]?.label ?? "";
    const last = this.passages[this.count - 1]?.label ?? "";
    return [
      `# 상품 등록 정보 — ${name}`,
      "",
      "| 항목 | 내용 |",
      "|---|---|",
      `| 상품 코드 | ${this.productCode()} |`,
      `| 상품명 | ${name} |`,
      `| 대상 | ${this.order.grade} |`,
      `| 시험/교재 | ${this.order.exam || "—"} |`,
      `| 지문 | ${this.count}개 (${first}${this.count > 1 ? ` ~ ${last}` : ""}) |`,
      "| 구성 | 지문마다 분석지 · 단어장 · 워크북 · 변형문제 5문항 · 서술형 4문항 |",
      "| 파일 | 지문별 PDF + 전 지문 통합 PDF |",
      "| 가격 | [대표 입력] |",
      `| 검수 | 판매 가능 ${ok}지문 · 수정 후 판매 ${fix}지문 |`,
      "",
      "## 파일 이름",
      `- ${fileNameFor(this.order, "전지문_5종_통합", "pdf")}`,
      ...this.passages.map((p) => `- ${fileNameFor(this.order, `${slug(p.label)}_5종`, "pdf")}`),
      "",
      "## 스프레드시트에 붙여넣기",
      "- '시트용 한 줄 복사'를 누르면 이 순서로 복사돼요: 상품 코드 · 상품명 · 대상 · 시험 · 지문 수 · 구성 · 가격 · 등록일",
      "- 가격 칸은 비어 있어요. 시트에서 직접 넣어주세요.",
    ].join("\n");
  }

  private briefingMarkdown() {
    const today = new Date().toLocaleDateString("ko-KR");
    const n = this.count;
    const rows = PART_ORDER.map((id) => {
      const done = this.partCount(id, "done");
      const failed = this.partCount(id, "failed");
      return `| ${roomOf(PART_META[id].dept).name} | ${PART_META[id].title} | ${done}/${n} 완료${failed ? ` · 실패 ${failed}` : ""} |`;
    });
    const globalRows = (["plan", "detail", "promo", "listing"] as GlobalId[]).map((id) => {
      const s = this.global[id];
      const state =
        s.status === "done" ? "완료" : s.status === "failed" ? `실패 — ${s.error}` : s.status === "skipped" ? "건너뜀" : "대기";
      return `| ${roomOf(GLOBAL_META[id].dept).name} | ${GLOBAL_META[id].title} | ${state} |`;
    });
    const { ok, fix } = this.verdicts();
    const missing = SALE_PARTS.reduce((sum, id) => sum + (n - this.partCount(id, "done")), 0);
    const resting = Object.entries(BLOCK_NEED).map(([dept, need]) => `- ${roomOf(dept).name}: ${need} 전이라 오늘은 쉬었어요.`);
    const todo = [
      ...(this.halted ? [`AI 작업이 중간에 멈췄어요 (${this.halted}) — 결과물 창고에서 '이어서 만들기'`] : []),
      ...(missing ? [`아직 없는 판매 자료 ${missing}건 — '이어서 만들기' 또는 실패한 자료 '다시 만들기'`] : []),
      `검수 보고서 확인 — 수정 후 판매로 나온 지문 ${fix}개`,
      "PDF 내려받기 (지문별 + 전 지문 통합본)",
      "판매 파일 드라이브에 올리고 시트에 등록 (구글 드라이브를 연결하면 직원들이 해요)",
      "황영카·기출비 카페와 블로그에 홍보글 게시 + 견본 PDF 첨부",
    ];
    return [
      `# 비서실 브리핑 — ${today}`,
      "",
      `${DEPT_LEAD.secretary.name} 비서실장이 정리했어요. 상품: **${this.productName()}** (지문 ${n}개)`,
      "",
      "## 지문별 자료",
      "| 팀 | 결과물 | 상태 |",
      "|---|---|---|",
      ...rows,
      "",
      "## 세트 자료",
      "| 팀 | 결과물 | 상태 |",
      "|---|---|---|",
      ...globalRows,
      "",
      "## 검수 결과",
      `- 판매 가능 ${ok}지문 · 수정 후 판매 ${fix}지문 · 판정 없음 ${n - ok - fix}지문`,
      "",
      "## 대표님이 하실 일",
      ...todo.map((t, i) => `${i + 1}. ${t}`),
      "",
      ...(resting.length ? ["## 쉬는 팀", ...resting] : []),
    ].join("\n");
  }

  // ── 저장 ────────────────────────────────────────────────
  data(): RunData {
    return {
      version: 2,
      id: this.id,
      createdAt: this.createdAt,
      order: this.order,
      plan: this.plan,
      productName: this.productName(),
      global: this.global,
      passages: this.passages.map((p) => ({ ...p })),
      halted: this.halted,
      sheetRow: this.sheetRow(),
    };
  }

  private persistRun() {
    this.saver?.saveRun(this.data());
  }
}
