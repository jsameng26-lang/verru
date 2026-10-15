// 결과물 창고 — 만든 자료를 Claude 페이지의 저장소(db)에 보관한다.
// runs/<세트>            세트 정보 + 지문 목록(상태만)
// runs/<세트>/passages/<지문>  지문 하나의 5종 + 검수 전문
// 저장소는 페이지 주인과 편집자만 읽고 쓸 수 있게 막아둔다 (게시할 때 rules 로 지정).
import type { Db } from "./claude";
import { PART_ORDER, type PartId, type PassageData, type RunData, type SectionStatus } from "./job";

const RUNS = "runs";

export type PassageIndex = { key: string; label: string; status: Record<PartId, SectionStatus> };
/** 목록에 보이는 세트 — 지문 전문은 빠져 있다 */
export type RunSummary = Omit<RunData, "passages"> & { passageIndex: PassageIndex[] };

export function summarize(run: RunData): RunSummary {
  const { passages, ...rest } = run;
  return {
    ...rest,
    // 원문은 지문 문서에 있으니 세트 문서에는 다시 싣지 않는다
    order: { ...run.order, passages: "" },
    passageIndex: passages.map((p) => ({
      key: p.key,
      label: p.label,
      status: Object.fromEntries(PART_ORDER.map((id) => [id, p.parts[id].status])) as Record<PartId, SectionStatus>,
    })),
  };
}

export class RunStore {
  private db: Db;
  /** 문서마다 쓰기는 한 번에 하나 — 쓰는 중에 또 오면 마지막 것만 이어서 쓴다 */
  private writing = new Set<string>();
  private queued = new Map<string, Record<string, unknown>>();

  constructor(db: Db) {
    this.db = db;
  }

  private write(collection: string, id: string, body: Record<string, unknown>) {
    const path = `${collection}/${id}`;
    if (this.writing.has(path)) {
      this.queued.set(path, body);
      return;
    }
    this.writing.add(path);
    this.db
      .collection(collection)
      .doc(id)
      .set(JSON.parse(JSON.stringify(body)) as Record<string, unknown>)
      .catch((e: { code?: string }) => console.warn("결과물 저장 실패", path, e?.code))
      .finally(() => {
        this.writing.delete(path);
        const next = this.queued.get(path);
        if (next) {
          this.queued.delete(path);
          this.write(collection, id, next);
        }
      });
  }

  saveRun = (run: RunData) => this.write(RUNS, run.id, summarize(run) as unknown as Record<string, unknown>);

  savePassage = (runId: string, passage: PassageData) =>
    this.write(`${RUNS}/${runId}/passages`, passage.key, passage as unknown as Record<string, unknown>);

  async load(summary: RunSummary): Promise<RunData> {
    const snap = await this.db.collection(`${RUNS}/${summary.id}/passages`).get();
    const byKey = new Map(snap.docs.filter((d) => d.exists).map((d) => [d.id, d.data() as unknown as PassageData]));
    const { passageIndex, ...rest } = summary;
    return {
      ...rest,
      passages: passageIndex.map(
        (idx) =>
          byKey.get(idx.key) ?? {
            key: idx.key,
            label: idx.label,
            text: "",
            parts: Object.fromEntries(
              PART_ORDER.map((id) => [id, { status: "idle", text: "", error: "", truncated: false }]),
            ) as PassageData["parts"],
          },
      ),
    };
  }

  async remove(summary: RunSummary) {
    for (const idx of summary.passageIndex) await this.db.collection(`${RUNS}/${summary.id}/passages`).doc(idx.key).delete();
    await this.db.collection(RUNS).doc(summary.id).delete();
  }

  /** 최근 30세트를 실시간으로. 반환값을 호출하면 구독 종료 */
  subscribe(onRuns: (runs: RunSummary[]) => void, onError: () => void) {
    return this.db
      .collection(RUNS)
      .orderBy("createdAt", "desc")
      .limit(30)
      .onSnapshot(
        (snap) =>
          onRuns(
            snap.docs
              .filter((d) => d.exists && (d.data() as { version?: number })?.version === 2)
              .map((d) => d.data() as unknown as RunSummary),
          ),
        () => onError(),
      );
  }
}
