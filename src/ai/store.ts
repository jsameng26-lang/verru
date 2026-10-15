// 결과물 창고 — 만든 자료를 Claude 페이지의 저장소(db)에 보관한다.
// 저장소는 페이지 주인과 편집자만 읽고 쓸 수 있게 막아둔다 (게시할 때 rules 로 지정).
import type { Db } from "./claude";
import type { RunData } from "./job";

const COLLECTION = "runs";

export class RunStore {
  private db: Db;
  /** 문서마다 쓰기는 한 번에 하나 — 진행 중이면 마지막 상태만 이어서 쓴다 */
  private writing = new Map<string, Promise<void>>();
  private queued = new Map<string, RunData>();

  constructor(db: Db) {
    this.db = db;
  }

  save = (run: RunData) => {
    if (this.writing.has(run.id)) {
      this.queued.set(run.id, run);
      return;
    }
    const write = this.db
      .collection(COLLECTION)
      .doc(run.id)
      .set(JSON.parse(JSON.stringify(run)) as Record<string, unknown>)
      .catch((e: { code?: string }) => {
        console.warn("결과물 저장 실패", e?.code);
      })
      .finally(() => {
        this.writing.delete(run.id);
        const next = this.queued.get(run.id);
        if (next) {
          this.queued.delete(run.id);
          this.save(next);
        }
      });
    this.writing.set(run.id, write);
  };

  remove(id: string) {
    return this.db.collection(COLLECTION).doc(id).delete();
  }

  /** 최근 30건을 실시간으로 받는다. 반환값을 호출하면 구독 종료 */
  subscribe(onRuns: (runs: RunData[]) => void, onError: () => void) {
    return this.db
      .collection(COLLECTION)
      .orderBy("createdAt", "desc")
      .limit(30)
      .onSnapshot(
        (snap) => onRuns(snap.docs.filter((d) => d.exists).map((d) => d.data() as unknown as RunData)),
        () => onError(),
      );
  }
}
