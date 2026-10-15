// 실제 업무 화면 조각들: 작업 지시서, 오늘 결과물, 문서 보기 창, 결과물 창고 상세
import { useState, type ReactNode } from "react";
import { parseMarkdown, toPlainText, type Run } from "./ai/markdown";
import { SALE_SECTIONS, SECTION_META, SECTION_ORDER, type RunData, type Section, type SectionId } from "./ai/job";
import type { WorkInput } from "./ai/prompts";
import { roomOf } from "./game/world";

export type AiState = "checking" | "ready" | "off";

export const GRADES = ["고1", "고2", "고3", "중3", "중2", "기타"];

export const EXAMPLE_INPUT: WorkInput = {
  exam: "연습용 예시 지문",
  number: "예시 1",
  grade: "고2",
  passage:
    "Many people treat boredom as a problem to be solved as quickly as possible. The moment we feel it, we reach for our phones, filling every empty minute with messages, videos, and news. Yet researchers who study creativity suggest that boredom may be more useful than it seems. When the mind is not occupied by an external task, it begins to wander, connecting memories and ideas that normally stay apart. In one experiment, participants who first completed a dull copying task came up with more original uses for a pair of plastic cups than those who started immediately. The dull task did not make them smarter; it simply gave their thoughts room to drift. This does not mean we should seek boredom for its own sake. Rather, it suggests that an occasional empty moment, left unfilled, can be the starting point of a new idea.",
  memo: "",
};

// ── 마크다운 보기 ─────────────────────────────────────────
function runs(list: Run[]): ReactNode {
  return list.map((r, i) => (r.bold ? <strong key={i}>{r.text}</strong> : <span key={i}>{r.text}</span>));
}

export function MarkdownView({ source }: { source: string }) {
  const blocks = parseMarkdown(source);
  return (
    <div className="md-view">
      {blocks.map((block, i) => {
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
          case "list":
            return block.ordered ? (
              <ol key={i}>
                {block.items.map((item, j) => (
                  <li key={j}>{runs(item)}</li>
                ))}
              </ol>
            ) : (
              <ul key={i}>
                {block.items.map((item, j) => (
                  <li key={j}>{runs(item)}</li>
                ))}
              </ul>
            );
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

// ── 작업 지시서 ───────────────────────────────────────────
export function WorkOrder({
  input,
  setInput,
  ai,
  locked,
}: {
  input: WorkInput;
  setInput: (next: WorkInput) => void;
  ai: AiState;
  locked: boolean;
}) {
  const set = (patch: Partial<WorkInput>) => setInput({ ...input, ...patch });
  const words = input.passage.trim() ? input.passage.trim().split(/\s+/).length : 0;
  if (locked) {
    // 일하는 동안에는 한 줄로 접어서 사무실이 잘 보이게
    return (
      <section className="win work-order compact" id="work-order">
        <div className="win-body">
          <b>📝 오늘 작업</b>
          <span>
            {ai === "ready"
              ? [input.exam, input.number, input.grade].filter(Boolean).join(" · ") + ` · ${words}단어`
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
              <b>실제 작업 모드</b> 지문을 넣고 업무를 시작하면 직원들이 분석지·단어장·워크북·변형문제·서술형과 검수
              보고서, 상세페이지·홍보글을 실제로 써요. 지문 하나에 AI 작업이 약 10번 돌고, 대표님의 Claude 사용량을 써요.
            </>
          ) : ai === "checking" ? (
            <>
              <b>AI 연결 확인 중…</b>
            </>
          ) : (
            <>
              <b>연습 모드</b> 이 화면에선 AI를 부를 수 없어서 연출만 돌아가요. Claude에서 이 페이지를 열면 실제로
              자료를 만들어요.
            </>
          )}
        </div>
        <div className="order-grid">
          <label>
            <span>시험·교재</span>
            <input
              id="order-exam"
              value={input.exam}
              disabled={locked}
              onChange={(e) => set({ exam: e.target.value })}
              placeholder="예: 2026 고2 10월 학평"
            />
          </label>
          <label>
            <span>문항·지문 번호</span>
            <input
              id="order-number"
              value={input.number}
              disabled={locked}
              onChange={(e) => set({ number: e.target.value })}
              placeholder="예: 31번"
            />
          </label>
          <label>
            <span>대상</span>
            <select id="order-grade" value={input.grade} disabled={locked} onChange={(e) => set({ grade: e.target.value })}>
              {GRADES.map((g) => (
                <option key={g}>{g}</option>
              ))}
            </select>
          </label>
        </div>
        <label className="order-passage">
          <span>
            영어 지문 <small>{words ? `${words}단어` : "한 번에 지문 1개"}</small>
          </span>
          <textarea
            id="order-passage"
            value={input.passage}
            disabled={locked}
            onChange={(e) => set({ passage: e.target.value })}
            placeholder="여기에 영어 지문을 그대로 붙여넣으세요."
            rows={6}
          />
        </label>
        <details className="order-memo">
          <summary>수요 메모 (선택) — 카페 요청글, 시험 범위 공지 등을 붙여넣으면 수요조사팀이 정리해요</summary>
          <textarea
            id="order-memo"
            value={input.memo}
            disabled={locked}
            onChange={(e) => set({ memo: e.target.value })}
            placeholder="예: '고2 10월 학평 31~40번 변형문제 구합니다' 같은 카페 글"
            rows={3}
          />
        </details>
        <div className="order-actions">
          <button className="text-button" disabled={locked} onClick={() => setInput(EXAMPLE_INPUT)}>
            예시 지문 넣기
          </button>
          <button
            className="text-button"
            disabled={locked}
            onClick={() => setInput({ exam: "", number: "", grade: input.grade, passage: "", memo: "" })}
          >
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
  onOpen,
  onStop,
}: {
  run: RunData | null;
  ai: AiState;
  pending: boolean;
  onOpen: (id: SectionId) => void;
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
            <ul className="outputs-list">
              {SECTION_ORDER.map((id) => {
                const sec = run.sections[id];
                const chip = sectionChip(sec);
                const meta = SECTION_META[id];
                const room = roomOf(meta.dept);
                const viewable = sec.status === "done" || sec.status === "failed" || (sec.status === "running" && sec.text);
                return (
                  <li key={id}>
                    <i aria-hidden="true">{room.icon}</i>
                    <span>
                      <b>{meta.title}</b>
                      <small>{room.name}</small>
                    </span>
                    <em className={`status-pill ${chip.cls}`}>{chip.text}</em>
                    <button className="mini-open" disabled={!viewable} onClick={() => onOpen(id)}>
                      보기
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        ) : (
          <p className="outputs-empty">
            {ai === "off"
              ? "연습 모드라 실제 결과물은 만들어지지 않아요."
              : "작업 지시서에 지문을 넣고 업무를 시작하면, 팀마다 만든 결과물이 여기에 하나씩 쌓여요."}
          </p>
        )}
      </div>
    </section>
  );
}

// ── 문서 보기 창 ──────────────────────────────────────────
export function OutputModal({
  run,
  id,
  canSave,
  canRerun,
  onRerun,
  onCopy,
  onSave,
  onClose,
}: {
  run: RunData;
  id: SectionId;
  canSave: boolean;
  canRerun: boolean;
  onRerun: () => void;
  onCopy: (text: string, done: string) => void;
  onSave: (ids: SectionId[], part: string) => void;
  onClose: () => void;
}) {
  const sec = run.sections[id];
  const meta = SECTION_META[id];
  const chip = sectionChip(sec);
  const plainFriendly = id === "promo" || id === "detail";
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        className="win team-modal doc-modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={meta.title}
      >
        <div className="win-bar">
          <span>
            {roomOf(meta.dept).icon} {meta.title}
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
            {id === "listing" ? (
              <button className="btn btn-small" onClick={() => onCopy(run.sheetRow, "시트용 한 줄을 복사했어요")}>
                시트용 한 줄 복사
              </button>
            ) : null}
            {canSave ? (
              <button
                className="btn btn-small"
                disabled={sec.status !== "done"}
                onClick={() => onSave([id], meta.title.replace(/\s/g, ""))}
              >
                .docx 저장
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

// ── 결과물 창고: 저장된 세트 한 건 ─────────────────────────
export function RunModal({
  run,
  canSave,
  onOpen,
  onSave,
  onDelete,
  onClose,
}: {
  run: RunData;
  canSave: boolean;
  onOpen: (id: SectionId) => void;
  onSave: (ids: SectionId[], part: string) => void;
  onDelete: (() => void) | null;
  onClose: () => void;
}) {
  const saleReady = SALE_SECTIONS.filter((id) => run.sections[id]?.status === "done");
  const [confirmDelete, setConfirmDelete] = useState(false);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        className="win team-modal doc-modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={run.productName}
      >
        <div className="win-bar">
          <span>📦 result_set</span>
          <button className="window-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="win-body">
          <p className="brief-date">
            {new Date(run.createdAt).toLocaleString("ko-KR")} · {run.input.grade} · {run.input.exam} {run.input.number}
          </p>
          <h3>{run.productName}</h3>
          <ul className="outputs-list">
            {SECTION_ORDER.map((id) => {
              const sec = run.sections[id];
              if (!sec) return null;
              const chip = sectionChip(sec);
              const meta = SECTION_META[id];
              return (
                <li key={id}>
                  <i aria-hidden="true">{roomOf(meta.dept).icon}</i>
                  <span>
                    <b>{meta.title}</b>
                    <small>{roomOf(meta.dept).name}</small>
                  </span>
                  <em className={`status-pill ${chip.cls}`}>{chip.text}</em>
                  <button className="mini-open" disabled={!sec.text} onClick={() => onOpen(id)}>
                    보기
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="doc-actions">
            {canSave ? (
              <button className="btn btn-primary" disabled={!saleReady.length} onClick={() => onSave(saleReady, "전체세트")}>
                판매용 세트 한 파일로 저장 ({saleReady.length}종)
              </button>
            ) : null}
            {onDelete ? (
              <button
                className={`text-button ${confirmDelete ? "danger" : ""}`}
                onClick={() => (confirmDelete ? onDelete() : setConfirmDelete(true))}
              >
                {confirmDelete ? "한 번 더 누르면 지워져요" : "창고에서 지우기"}
              </button>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}
