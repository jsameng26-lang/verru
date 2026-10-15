// 실제 업무 화면 조각들: 작업 지시서, 오늘 결과물, 세트 창(지문별 결과물·PDF), 문서 보기 창
import { useState, type ReactNode } from "react";
import {
  GLOBAL_META,
  GLOBAL_ORDER,
  PART_META,
  PART_ORDER,
  SALE_PARTS,
  WorkJob,
  type GlobalId,
  type OrderInput,
  type PartId,
  type RunData,
  type Section,
} from "./ai/job";
import { parseMarkdown, toPlainText, type Run } from "./ai/markdown";
import type { Passage } from "./ai/passages";
import { roomOf } from "./game/world";

export type AiState = "checking" | "ready" | "off";

/** 문서 보기 창이 가리키는 대상 */
export type DocRef = { kind: "global"; id: GlobalId } | { kind: "part"; key: string; id: PartId };

export const GRADES = ["고1", "고2", "고3", "중3", "중2", "기타"];

export const EXAMPLE_ORDER: OrderInput = {
  exam: "연습용 예시 지문",
  grade: "고2",
  memo: "",
  passages: `예시 1
Many people treat boredom as a problem to be solved as quickly as possible. The moment we feel it, we reach for our phones, filling every empty minute with messages, videos, and news. Yet researchers who study creativity suggest that boredom may be more useful than it seems. When the mind is not occupied by an external task, it begins to wander, connecting memories and ideas that normally stay apart. The dull moment does not make us smarter; it simply gives our thoughts room to drift. An occasional empty moment, left unfilled, can be the starting point of a new idea.

예시 2
When a city plants trees along its streets, the benefits go far beyond appearance. Shade from trees can lower the temperature of pavement by several degrees, which reduces the energy people use for air conditioning. Trees also slow down rainwater, giving the ground time to absorb it instead of sending it rushing into drains. Perhaps less obviously, residents of tree-lined streets tend to walk more and to know their neighbors better. A tree, in other words, is not decoration but infrastructure, and it deserves to be planned with the same care as roads and pipes.`,
};

// ── 마크다운 보기 ─────────────────────────────────────────
function runs(list: Run[]): ReactNode {
  return list.map((r, i) => (r.bold ? <strong key={i}>{r.text}</strong> : <span key={i}>{r.text}</span>));
}

export function MarkdownView({ source }: { source: string }) {
  return (
    <div className="md-view">
      {parseMarkdown(source).map((block, i) => {
        switch (block.kind) {
          case "heading":
            return block.level === 1 ? (
              <h2 key={i}>{runs(block.runs)}</h2>
            ) : block.level === 2 ? (
              <h3 key={i}>{runs(block.runs)}</h3>
            ) : (
              <h4 key={i}>{runs(block.runs)}</h4>
            );
          case "para":
            return <p key={i}>{runs(block.runs)}</p>;
          case "quote":
            return <blockquote key={i}>{runs(block.runs)}</blockquote>;
          case "list": {
            const items = block.items.map((item, j) => <li key={j}>{runs(item)}</li>);
            return block.ordered ? <ol key={i}>{items}</ol> : <ul key={i}>{items}</ul>;
          }
          case "table":
            return (
              <div className="md-table" key={i}>
                <table>
                  <thead>
                    <tr>
                      {block.header.map((cell, j) => (
                        <th key={j}>{runs(cell)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, j) => (
                      <tr key={j}>
                        {row.map((cell, k) => (
                          <td key={k}>{runs(cell)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          case "hr":
            return <hr key={i} />;
        }
        return null;
      })}
    </div>
  );
}

// ── 상태 표시 ─────────────────────────────────────────────
export function sectionChip(sec: Section) {
  switch (sec.status) {
    case "running":
      return { cls: "working", text: sec.text ? `작성 중 ${sec.text.length.toLocaleString()}자` : "구상 중…" };
    case "done":
      return { cls: "done", text: sec.truncated ? "완료 (일부 잘림)" : "완료" };
    case "failed":
      return { cls: "blocked", text: "실패" };
    case "skipped":
      return { cls: "waiting", text: "건너뜀" };
    default:
      return { cls: "waiting", text: "대기" };
  }
}

export function partTally(run: RunData, id: PartId) {
  const n = run.passages.length;
  const done = run.passages.filter((p) => p.parts[id].status === "done").length;
  const failed = run.passages.filter((p) => p.parts[id].status === "failed").length;
  const running = run.passages.filter((p) => p.parts[id].status === "running").length;
  return { n, done, failed, running };
}

export const saleReadyCount = (run: RunData) =>
  run.passages.filter((p) => SALE_PARTS.some((id) => p.parts[id].status === "done")).length;

/** 걸리는 시간 어림 (AI 한 번에 30~50초, 동시에 2개) */
export function estimate(count: number, memo: boolean) {
  const calls = WorkJob.estimateCalls(count, memo);
  return { calls, min: Math.max(1, Math.round((calls * 30) / 2 / 60)), max: Math.max(2, Math.round((calls * 50) / 2 / 60)) };
}

// ── 작업 지시서 ───────────────────────────────────────────
export function WorkOrder({
  order,
  setOrder,
  parsed,
  ai,
  locked,
}: {
  order: OrderInput;
  setOrder: (next: OrderInput) => void;
  parsed: Passage[];
  ai: AiState;
  locked: boolean;
}) {
  const set = (patch: Partial<OrderInput>) => setOrder({ ...order, ...patch });
  const est = estimate(parsed.length, Boolean(order.memo.trim()));
  const short = parsed.filter((p) => p.words < 30);
  const dropped = parsed.reduce((sum, p) => sum + p.dropped, 0);

  if (locked) {
    return (
      <section className="win work-order compact" id="work-order">
        <div className="win-body">
          <b>📝 오늘 작업</b>
          <span>
            {ai === "ready"
              ? `${[order.exam, order.grade].filter(Boolean).join(" · ")} · 지문 ${parsed.length}개 · 5종`
              : "연습 모드 — 실제 자료는 만들지 않아요"}
          </span>
          <small>업무가 끝나면 새 지문을 넣을 수 있어요</small>
        </div>
      </section>
    );
  }

  return (
    <section className="win work-order" id="work-order">
      <div className="win-bar">
        <span>📝 work.order — 오늘 작업 지시서</span>
        <span className="window-controls">—　▢　✕</span>
      </div>
      <div className="win-body">
        <div className={`ai-note ${ai}`}>
          {ai === "ready" ? (
            <>
              <b>실제 작업 모드</b> 전 지문을 붙여넣고 업무를 시작하면, 지문마다 분석지·단어장·워크북·변형문제·서술형과
              검수 보고서를 실제로 쓰고, 지문별 PDF와 전 지문 통합 PDF로 묶어요. 대표님의 Claude 사용량을 써요.
            </>
          ) : ai === "checking" ? (
            <b>AI 연결 확인 중…</b>
          ) : (
            <>
              <b>연습 모드</b> 이 화면에선 AI를 부를 수 없어서 연출만 돌아가요. Claude에서 이 페이지를 열면 실제로
              자료를 만들어요.
            </>
          )}
        </div>
        <div className="order-grid two">
          <label>
            <span>시험·교재</span>
            <input
              id="order-exam"
              value={order.exam}
              onChange={(e) => set({ exam: e.target.value })}
              placeholder="예: 2026 고2 10월 학평 / 올림포스 독해의 기본1 3강"
            />
          </label>
          <label>
            <span>대상</span>
            <select id="order-grade" value={order.grade} onChange={(e) => set({ grade: e.target.value })}>
              {GRADES.map((g) => (
                <option key={g}>{g}</option>
              ))}
            </select>
          </label>
        </div>
        <label className="order-passage">
          <span>
            전 지문 <small>지문마다 앞에 번호 줄을 넣어주세요 — 예: 18번 / [19] / 3강 2번</small>
          </span>
          <textarea
            id="order-passage"
            value={order.passages}
            onChange={(e) => set({ passages: e.target.value })}
            placeholder={"18번\nMany people treat boredom as ...\n\n19번\nWhen a city plants trees ..."}
            rows={10}
          />
        </label>
        {parsed.length ? (
          <div className="parsed">
            <p>
              <b>지문 {parsed.length}개 인식</b> · AI 작업 약 {est.calls}번 · 예상 {est.min}~{est.max}분
              {dropped ? ` · 한글·선택지 줄 ${dropped}개는 지문이 아니라서 뺐어요` : ""}
            </p>
            <div className="parsed-chips">
              {parsed.map((p) => (
                <span key={p.key} className={p.words < 30 ? "warn" : ""} title={p.text.slice(0, 120)}>
                  {p.label} <small>{p.words}단어</small>
                </span>
              ))}
            </div>
            {short.length ? (
              <p className="parsed-warn">
                30단어보다 짧은 지문이 있어요: {short.map((p) => p.label).join(", ")} — 번호 줄이 맞는지 확인해주세요.
              </p>
            ) : null}
          </div>
        ) : null}
        <details className="order-memo">
          <summary>수요 메모 (선택) — 카페 요청글, 시험 범위 공지 등을 붙여넣으면 수요조사팀이 정리해요</summary>
          <textarea
            id="order-memo"
            value={order.memo}
            onChange={(e) => set({ memo: e.target.value })}
            placeholder="예: '고2 10월 학평 전 지문 변형문제 구합니다' 같은 카페 글"
            rows={3}
          />
        </details>
        <div className="order-actions">
          <button className="text-button" onClick={() => setOrder(EXAMPLE_ORDER)}>
            예시 지문 넣기
          </button>
          <button className="text-button" onClick={() => setOrder({ exam: "", grade: order.grade, passages: "", memo: "" })}>
            비우기
          </button>
          <span className="order-hint">위쪽 ‘오늘 업무 시작하기’를 누르면 출근합니다.</span>
        </div>
      </div>
    </section>
  );
}

// ── 오늘 결과물 (라이브 오피스 오른쪽) ─────────────────────
export function OutputsPanel({
  run,
  ai,
  pending,
  onOpenDoc,
  onOpenSet,
  onStop,
}: {
  run: RunData | null;
  ai: AiState;
  pending: boolean;
  onOpenDoc: (ref: DocRef) => void;
  onOpenSet: () => void;
  onStop: () => void;
}) {
  return (
    <section className="win rail-card outputs-card" id="today-outputs">
      <div className="win-bar">
        <span>📦 work.outputs — 오늘 결과물</span>
        <span className="window-controls">—　▢　✕</span>
      </div>
      <div className="win-body outputs-body">
        {run ? (
          <>
            <div className="outputs-head">
              <b>{run.productName}</b>
              {pending ? (
                <button className="text-button" onClick={onStop}>
                  작업 멈추기
                </button>
              ) : null}
            </div>
            {run.halted ? (
              <p className="doc-error">{run.halted} 아래 ‘지문별 결과물’ 창의 ‘이어서 만들기’로 계속해요.</p>
            ) : null}
            <ul className="outputs-list">
              {PART_ORDER.map((id) => {
                const t = partTally(run, id);
                const room = roomOf(PART_META[id].dept);
                const cls = t.failed ? "blocked" : t.done === t.n ? "done" : t.running ? "working" : "waiting";
                return (
                  <li key={id}>
                    <i aria-hidden="true">{room.icon}</i>
                    <span>
                      <b>{PART_META[id].title}</b>
                      <small>{room.name}</small>
                    </span>
                    <em className={`status-pill ${cls}`}>
                      {t.done}/{t.n}
                      {t.failed ? ` · 실패 ${t.failed}` : t.running ? ` · ${t.running}개 작성 중` : ""}
                    </em>
                    <button className="mini-open" disabled={!t.done && !t.running && !t.failed} onClick={onOpenSet}>
                      보기
                    </button>
                  </li>
                );
              })}
              {GLOBAL_ORDER.map((id) => {
                const sec = run.global[id];
                const chip = sectionChip(sec);
                const room = roomOf(GLOBAL_META[id].dept);
                const viewable = sec.text !== "" || sec.status === "failed";
                return (
                  <li key={id}>
                    <i aria-hidden="true">{room.icon}</i>
                    <span>
                      <b>{GLOBAL_META[id].title}</b>
                      <small>{room.name}</small>
                    </span>
                    <em className={`status-pill ${chip.cls}`}>{chip.text}</em>
                    <button className="mini-open" disabled={!viewable} onClick={() => onOpenDoc({ kind: "global", id })}>
                      보기
                    </button>
                  </li>
                );
              })}
            </ul>
            <button className="btn btn-small" onClick={onOpenSet}>
              지문별 결과물 · PDF 받기
            </button>
          </>
        ) : (
          <p className="outputs-empty">
            {ai === "off"
              ? "연습 모드라 실제 결과물은 만들어지지 않아요."
              : "작업 지시서에 전 지문을 넣고 업무를 시작하면, 팀마다 만든 결과물이 여기에 쌓여요."}
          </p>
        )}
      </div>
    </section>
  );
}

// ── 세트 창: 지문별 결과물 + PDF ───────────────────────────
export function SetModal({
  run,
  busy,
  canSave,
  canResume,
  live,
  onOpenDoc,
  onPassagePdf,
  onCombinedPdf,
  onBundle,
  onResume,
  onDelete,
  onClose,
}: {
  run: RunData;
  busy: string;
  canSave: boolean;
  canResume: boolean;
  live: boolean;
  onOpenDoc: (ref: DocRef) => void;
  onPassagePdf: (key: string) => void;
  onCombinedPdf: () => void;
  onBundle: () => void;
  onResume: () => void;
  onDelete: (() => void) | null;
  onClose: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const ready = saleReadyCount(run);
  const total = run.passages.length;
  const incomplete =
    run.passages.some((p) => PART_ORDER.some((id) => p.parts[id].status !== "done")) ||
    (["plan", "detail", "promo"] as GlobalId[]).some((id) => run.global[id].status !== "done");
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        className="win team-modal doc-modal set-modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={run.productName}
      >
        <div className="win-bar">
          <span>📦 result_set — {live ? "오늘 작업" : "결과물 창고"}</span>
          <button className="window-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="win-body">
          <p className="brief-date">
            {new Date(run.createdAt).toLocaleString("ko-KR")} · {run.order.grade} · {run.order.exam} · 지문 {total}개
          </p>
          <h3>{run.productName}</h3>
          {run.halted ? <p className="doc-error">{run.halted}</p> : null}

          <div className="doc-actions">
            {canSave ? (
              <>
                <button className="btn btn-primary" disabled={!ready || Boolean(busy)} onClick={onBundle}>
                  PDF 전체 받기 (zip · 지문별 {ready}개 + 통합본)
                </button>
                <button className="btn btn-small" disabled={!ready || Boolean(busy)} onClick={onCombinedPdf}>
                  전 지문 통합 PDF
                </button>
              </>
            ) : (
              <span className="order-hint">이 화면에서는 파일 저장을 쓸 수 없어요.</span>
            )}
            {canResume && incomplete ? (
              <button className="btn btn-small btn-ghost" disabled={Boolean(busy)} onClick={onResume}>
                이어서 만들기
              </button>
            ) : null}
            {busy ? <span className="order-hint">{busy}</span> : null}
          </div>

          <div className="doc-scroll set-scroll">
            <div className="md-table">
              <table className="set-table">
                <thead>
                  <tr>
                    <th>지문</th>
                    {PART_ORDER.map((id) => (
                      <th key={id}>{PART_META[id].title.replace(" 대비", "").replace(" 보고서", "")}</th>
                    ))}
                    <th>PDF</th>
                  </tr>
                </thead>
                <tbody>
                  {run.passages.map((p) => (
                    <tr key={p.key}>
                      <th>{p.label}</th>
                      {PART_ORDER.map((id) => {
                        const sec = p.parts[id];
                        const chip = sectionChip(sec);
                        return (
                          <td key={id}>
                            <button
                              className={`cell-chip ${chip.cls}`}
                              disabled={!sec.text && sec.status !== "failed"}
                              onClick={() => onOpenDoc({ kind: "part", key: p.key, id })}
                              title={`${p.label} ${PART_META[id].title}: ${chip.text}`}
                              aria-label={`${p.label} ${PART_META[id].title} ${chip.text}`}
                            >
                              {sec.status === "done" ? "✓" : sec.status === "failed" ? "!" : sec.status === "running" ? "…" : "·"}
                            </button>
                          </td>
                        );
                      })}
                      <td>
                        <button
                          className="mini-open"
                          disabled={!canSave || Boolean(busy) || !SALE_PARTS.some((id) => p.parts[id].status === "done")}
                          onClick={() => onPassagePdf(p.key)}
                        >
                          PDF
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="order-hint set-legend">✓ 완료 · … 작성 중 · ! 실패 (눌러서 다시 만들기) · · 대기</p>

            <h4>세트 자료</h4>
            <ul className="outputs-list">
              {GLOBAL_ORDER.map((id) => {
                const sec = run.global[id];
                const chip = sectionChip(sec);
                return (
                  <li key={id}>
                    <i aria-hidden="true">{roomOf(GLOBAL_META[id].dept).icon}</i>
                    <span>
                      <b>{GLOBAL_META[id].title}</b>
                      <small>{roomOf(GLOBAL_META[id].dept).name}</small>
                    </span>
                    <em className={`status-pill ${chip.cls}`}>{chip.text}</em>
                    <button
                      className="mini-open"
                      disabled={!sec.text && sec.status !== "failed"}
                      onClick={() => onOpenDoc({ kind: "global", id })}
                    >
                      보기
                    </button>
                  </li>
                );
              })}
            </ul>
            <p className="drive-note">
              <b>판매 파일 드라이브 정리</b> 구글 드라이브를 Claude에 연결하면, 대표님 승인 후 직원들이 PDF를 판매 파일
              드라이브에 올리고 시트에 등록하게 할 수 있어요. 지금은 PDF를 받아서 직접 올려주세요.
            </p>
          </div>

          {onDelete ? (
            <div className="doc-actions">
              <button
                className={`text-button ${confirmDelete ? "danger" : ""}`}
                onClick={() => (confirmDelete ? onDelete() : setConfirmDelete(true))}
              >
                {confirmDelete ? "한 번 더 누르면 지워져요" : "창고에서 지우기"}
              </button>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}

// ── 문서 보기 창 ──────────────────────────────────────────
export function DocModal({
  run,
  doc,
  canSave,
  canRerun,
  onRerun,
  onCopy,
  onSaveDocx,
  onClose,
}: {
  run: RunData;
  doc: DocRef;
  canSave: boolean;
  canRerun: boolean;
  onRerun: () => void;
  onCopy: (text: string, done: string) => void;
  onSaveDocx: (markdown: string, part: string) => void;
  onClose: () => void;
}) {
  const passage = doc.kind === "part" ? run.passages.find((p) => p.key === doc.key) : undefined;
  const sec: Section | undefined = doc.kind === "global" ? run.global[doc.id] : passage?.parts[doc.id];
  if (!sec) return null;
  const meta = doc.kind === "global" ? GLOBAL_META[doc.id] : PART_META[doc.id];
  const title = passage ? `${passage.label} ${meta.title}` : meta.title;
  const chip = sectionChip(sec);
  const plainFriendly = doc.kind === "global" && (doc.id === "promo" || doc.id === "detail");
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        className="win team-modal doc-modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="win-bar">
          <span>
            {roomOf(meta.dept).icon} {title}
          </span>
          <button className="window-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="win-body">
          <div className="doc-top">
            <span className={`status-pill ${chip.cls}`}>{chip.text}</span>
            <small>
              {roomOf(meta.dept).name} · {run.productName}
            </small>
          </div>
          {sec.error ? <p className="doc-error">{sec.error}</p> : null}
          {sec.truncated ? <p className="doc-error">답이 길어서 끝부분이 잘렸어요. ‘다시 만들기’로 다시 받아보세요.</p> : null}
          <div className="doc-scroll">
            {sec.text ? <MarkdownView source={sec.text} /> : <p className="outputs-empty">아직 쓴 내용이 없어요.</p>}
          </div>
          <div className="doc-actions">
            <button className="btn btn-small" disabled={!sec.text} onClick={() => onCopy(sec.text, "복사했어요")}>
              복사
            </button>
            {plainFriendly ? (
              <button
                className="btn btn-small"
                disabled={!sec.text}
                onClick={() => onCopy(toPlainText(sec.text), "기호 없이 글만 복사했어요 — 카페·블로그에 바로 붙여넣으세요")}
              >
                글만 복사
              </button>
            ) : null}
            {doc.kind === "global" && doc.id === "listing" ? (
              <button className="btn btn-small" onClick={() => onCopy(run.sheetRow, "시트용 한 줄을 복사했어요")}>
                시트용 한 줄 복사
              </button>
            ) : null}
            {canSave ? (
              <button
                className="btn btn-small"
                disabled={sec.status !== "done"}
                onClick={() => onSaveDocx(sec.text, `${passage ? `${passage.label}_` : ""}${meta.title.replace(/\s/g, "")}`)}
              >
                워드(.docx)로 저장
              </button>
            ) : null}
            {canRerun ? (
              <button className="btn btn-small btn-ghost" disabled={sec.status === "running"} onClick={onRerun}>
                {sec.status === "running" ? "만드는 중…" : "다시 만들기"}
              </button>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}

