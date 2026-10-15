// 제작실 — 판매용 5종 세트를 검증된 제작기(Claude Code 세션)에 맡기고, 지켜보고, 승인하는 창
import { useCallback, useEffect, useRef, useState } from "react";
import { mcpErrorText, type Mcp } from "./ai/claude";
import type { OrderInput } from "./ai/job";
import type { Passage } from "./ai/passages";
import {
  REMOTE,
  REPLACE_MARK,
  fetchReport,
  listEnvironments,
  refreshSession,
  sendApproval,
  sendReplace,
  sessionUrl,
  stageOf,
  startProduction,
  suggestSetName,
  validSetName,
  watchSession,
  type Environment,
  type Production,
  type ProductionStore,
  type SessionState,
} from "./ai/remote";
import type { ProductionStage, ProductionView } from "./game/sim";
import { MarkdownView } from "./Work";

export type RemoteState = "checking" | "ready" | "off";

const ENV_KEY = "verru-production-env";

const STAGE: Record<ProductionStage | "unknown", { cls: string; text: string }> = {
  check: { cls: "working", text: "판매 파일 확인 중" },
  making: { cls: "working", text: "5종 세트 제작 중" },
  question: { cls: "approval", text: "교체할지 확인 필요" },
  report: { cls: "approval", text: "보고 도착" },
  uploading: { cls: "working", text: "판매 등록 중" },
  done: { cls: "done", text: "판매 등록 보고 도착" },
  blocked: { cls: "blocked", text: "세션에서 확인 필요" },
  stopped: { cls: "blocked", text: "멈춤" },
  unknown: { cls: "waiting", text: "확인 중" },
};

/** 아직 진행 중인 단계 — 진행 중인 게 없으면 가장 최근 제작의 마지막 단계(등록 끝·멈춤)를 보여 준다 */
const LIVE_STAGES = new Set<ProductionStage>(["check", "making", "question", "report", "uploading", "blocked"]);

/** 보냈는지 알 수 없는 실패 — 다시 보내지 말고 세션에서 확인하게 한다 */
const ambiguous = (e: unknown) => ["server_unavailable", "upstream_error", "cancelled"].includes((e as { code?: string })?.code ?? "");

function stamp(ms: number) {
  const d = new Date(ms);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function readEnv() {
  try {
    return localStorage.getItem(ENV_KEY) ?? "";
  } catch {
    return "";
  }
}

function ProductionRow({
  mcp,
  prod,
  onSave,
  onRemove,
  onReport,
  onView,
}: {
  mcp: Mcp;
  prod: Production;
  onSave: (p: Production) => void;
  onRemove: (p: Production) => void;
  onReport: (p: Production, text: string) => void;
  onView: (id: string, view: ProductionView | null) => void;
}) {
  const [state, setState] = useState<SessionState | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [approving, setApproving] = useState(false);
  const [note, setNote] = useState("");
  const looked = useRef("");
  /** 답·승인을 보낸 뒤 세션이 다시 '작업 중'이 되기 전까지 */
  const [resuming, setResuming] = useState(false);
  /** 세션이 멈춘 뒤 보고 첫 줄(교체 확인인지)을 본 상태 키 — 보기 전에는 '보고 도착'을 알리지 않는다 */
  const [checked, setChecked] = useState("");

  useEffect(
    () =>
      watchSession(mcp, prod.sessionId, (s, err) => {
        if (s) {
          setState(s);
          setError("");
          if (s.bucket === "working") setResuming(false);
        } else setError(mcpErrorText(err, REMOTE));
      }),
    [mcp, prod.sessionId],
  );

  const stage = stageOf(prod, state, resuming);
  const stateKey = state ? `${state.bucket}:${state.summary}` : "";
  const settled = stage !== "report" || Boolean(prod.replace) || checked === stateKey;
  const chip = STAGE[stage ?? "unknown"];
  const working = state?.bucket === "working";

  // 사무실 직원들이 이 세션 단계를 따라 움직이게 알린다
  useEffect(() => {
    onView(prod.id, stage && settled ? { id: prod.id, title: prod.title || prod.id, stage, summary: state?.summary ?? "" } : null);
  }, [onView, prod.id, prod.title, stage, settled, state?.summary]);
  useEffect(() => () => onView(prod.id, null), [onView, prod.id]);

  // 세션이 멈췄는데 아직 승인 전·교체 답 전이면 보고 첫 줄을 한 번 본다 — '[교체 확인]'이면 질문을 띄운다
  useEffect(() => {
    if (!state || state.bucket === "working" || state.bucket === "unknown") return;
    if (prod.approvedAt || prod.replace) return;
    const key = `${state.bucket}:${state.summary}`;
    if (looked.current === key) return;
    looked.current = key;
    fetchReport(mcp, prod.sessionId)
      .then((text) => {
        if (text.includes(REPLACE_MARK)) onSave({ ...prod, replace: "asked", replaceInfo: text.slice(0, 1200) });
      })
      .catch(() => undefined)   // 못 읽으면 '최근 보고 보기'로 직접 확인
      .finally(() => setChecked(key));
  }, [mcp, prod, state, onSave]);

  const openReport = async () => {
    setBusy("report");
    try {
      const text = await fetchReport(mcp, prod.sessionId);
      onReport(prod, text || "아직 보고가 없어요. 세션을 열어 진행 상황을 확인해 주세요.");
    } catch (e) {
      setError(mcpErrorText(e, REMOTE));
    } finally {
      setBusy("");
    }
  };

  const approve = async () => {
    setBusy("approve");
    try {
      await sendApproval(mcp, prod, note);
      setResuming(true);
      onSave({ ...prod, approvedAt: Date.now(), approveNote: note.trim() });
      setApproving(false);
      void refreshSession(mcp, prod.sessionId);
    } catch (e) {
      setError(ambiguous(e) ? "승인 메시지가 전해졌는지 알 수 없어요. 세션을 열어 확인한 뒤, 안 왔으면 다시 눌러 주세요." : mcpErrorText(e, REMOTE));
    } finally {
      setBusy("");
    }
  };

  const answer = async (yes: boolean) => {
    if (!yes && !window.confirm("이 회차는 만들지 않을까요? 드라이브의 지금 파일은 그대로 둬요.")) return;
    setBusy(yes ? "yes" : "no");
    try {
      await sendReplace(mcp, prod, yes);
      if (yes) setResuming(true);
      onSave({ ...prod, replace: yes ? "yes" : "no" });
      void refreshSession(mcp, prod.sessionId);
    } catch (e) {
      setError(ambiguous(e) ? "답이 전해졌는지 알 수 없어요. 세션을 열어 확인한 뒤, 안 왔으면 다시 눌러 주세요." : mcpErrorText(e, REMOTE));
    } finally {
      setBusy("");
    }
  };

  const asking = prod.replace === "asked" && !working;

  return (
    <li className="prod-row">
      <div className="prod-head">
        <em className={`status-pill ${chip.cls}`}>{chip.text}</em>
        <b>{prod.title || prod.id}</b>
        <small>
          sets/{prod.id} · 지문 {prod.count}개 · {stamp(prod.createdAt)} 시작
        </small>
        <a className="mini-open" href={sessionUrl(prod.sessionId)} target="_blank" rel="noreferrer">
          세션 열기 ↗
        </a>
      </div>
      {state?.summary ? <p className="prod-summary">{state.summary}</p> : null}
      {error ? <p className="prod-error">{error}</p> : null}
      {stage === "blocked" ? (
        <p className="prod-hint">세션이 대표님 확인을 기다려요(권한 허락이나 질문). ‘세션 열기’에서 답해 주세요.</p>
      ) : null}
      {prod.replace === "no" ? <p className="prod-hint">만들지 않기로 했어요. 드라이브의 파일은 그대로예요.</p> : null}
      {asking ? (
        <div className="prod-approve prod-question">
          <p>
            <b>📦 이 회차는 판매 파일 드라이브에 이미 파일이 있어요.</b> 새 5종 자료로 다시 만들까요? 만든 뒤에도 ‘승인 →
            판매 등록’을 누르기 전까지는 지금 파일이 그대로 팔려요(교체하면 예전 파일은 ‘_이전 파일’ 폴더로 옮겨져요).
          </p>
          {prod.replaceInfo ? <MarkdownView source={prod.replaceInfo} /> : null}
          <div className="prod-actions">
            <button className="btn btn-small" onClick={() => void answer(true)} disabled={busy !== ""}>
              {busy === "yes" ? "보내는 중…" : "교체해서 5종으로 새로 만들기"}
            </button>
            <button className="text-button" onClick={() => void answer(false)} disabled={busy !== ""}>
              {busy === "no" ? "보내는 중…" : "만들지 않기"}
            </button>
          </div>
        </div>
      ) : null}
      <div className="prod-actions">
        <button className="text-button" onClick={openReport} disabled={busy !== ""}>
          {busy === "report" ? "불러오는 중…" : "최근 보고 보기"}
        </button>
        <button className="text-button" onClick={() => void refreshSession(mcp, prod.sessionId)} disabled={busy !== ""}>
          새로고침
        </button>
        {prod.approvedAt ? (
          <span className="prod-approved">✅ {stamp(prod.approvedAt)} 승인 — 드라이브 등록을 맡겼어요</span>
        ) : prod.replace === "no" || asking ? null : (
          <button
            className="btn btn-small"
            onClick={() => setApproving(!approving)}
            disabled={working || busy !== ""}
            title={working ? "세션이 아직 만들고 있어요. 보고가 오면 승인할 수 있어요." : "결과물을 확인한 뒤 판매 등록을 맡깁니다"}
          >
            승인 → 판매 등록
          </button>
        )}
        <button className="text-button danger" onClick={() => onRemove(prod)} disabled={busy !== ""} title="세션은 그대로 두고 이 목록에서만 지워요">
          목록에서 지우기
        </button>
      </div>
      {approving && !prod.approvedAt ? (
        <div className="prod-approve">
          <p>
            세션의 PDF와 검수 보고를 확인하셨나요? 승인하면 세션이 판매 파일 드라이브의 상품 폴더에 올려요(예전 파일은
            ‘_이전 파일’ 폴더로 옮겨져요). 주문이 들어오면 관리자 페이지의 ‘파일 전송’이 이 파일을 보냅니다.
          </p>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="세션에 전할 메모 (선택) — 예: 상품 제목은 ○○, 가격 15,900원"
          />
          <div className="prod-actions">
            <button className="btn btn-small" onClick={approve} disabled={busy !== ""}>
              {busy === "approve" ? "보내는 중…" : "승인 보내기"}
            </button>
            <button className="text-button" onClick={() => setApproving(false)} disabled={busy !== ""}>
              취소
            </button>
          </div>
        </div>
      ) : null}
    </li>
  );
}

export function ProductionRoom({
  remote,
  mcp,
  store,
  order,
  parsed,
  onActivity,
}: {
  remote: RemoteState;
  mcp: Mcp | null;
  store: ProductionStore | null;
  order: OrderInput;
  parsed: Passage[];
  /** 사무실 직원들이 따라 움직일 제작 세션(가장 최근의 진행 중인 것) */
  onActivity?: (view: ProductionView | null) => void;
}) {
  const [list, setList] = useState<Production[]>([]);
  const [views, setViews] = useState<Record<string, ProductionView>>({});
  const [envs, setEnvs] = useState<Environment[] | null>(null);
  const [envId, setEnvId] = useState(readEnv);
  const [setName, setSetName] = useState("");
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [report, setReport] = useState<{ prod: Production; text: string } | null>(null);

  useEffect(() => {
    if (!store) return;
    return store.subscribe(setList, () => setError("제작 기록을 불러오지 못했어요."));
  }, [store]);

  const onView = useCallback((id: string, view: ProductionView | null) => {
    setViews((prev) => {
      const old = prev[id];
      if (!view) {
        if (!old) return prev;
        const next = { ...prev };
        delete next[id];
        return next;
      }
      if (old && old.stage === view.stage && old.summary === view.summary && old.title === view.title) return prev;
      return { ...prev, [id]: view };
    });
  }, []);

  // 목록은 최근 것부터 — 진행 중인 세션 중 가장 최근 것을 사무실에 보여 준다
  const active = list.map((p) => views[p.id]).find((v) => v && LIVE_STAGES.has(v.stage)) ?? (list[0] && views[list[0].id]) ?? null;
  const activeKey = active ? `${active.id}:${active.stage}:${active.summary}` : "";
  useEffect(() => {
    onActivity?.(active);
  }, [activeKey, onActivity]);   // activeKey가 같으면 active도 같은 내용

  const suggested = suggestSetName(order.exam, order.grade);
  const name = touched ? setName : suggested;
  // 끝난 제작(판매 등록 승인 · 만들지 않기)과 같은 묶음은 다시 맡길 수 있다(기록을 새 세션으로 바꿈)
  const duplicate = list.some((p) => p.id === name && !p.approvedAt && p.replace !== "no");

  const loadEnvs = async () => {
    if (!mcp) return;
    setBusy("env");
    setError("");
    try {
      const found = await listEnvironments(mcp);
      setEnvs(found);
      if (found.length && !found.some((e) => e.id === envId)) setEnvId(found[0].id);
    } catch (e) {
      setError(mcpErrorText(e, REMOTE));
    } finally {
      setBusy("");
    }
  };

  const save = (p: Production) => {
    setList((prev) => [p, ...prev.filter((x) => x.id !== p.id)].sort((a, b) => b.createdAt - a.createdAt));
    store?.save(p).catch(() => setError("제작 기록 저장에 실패했어요. 세션 주소를 따로 적어 두세요: " + sessionUrl(p.sessionId)));
  };

  const start = async () => {
    if (!mcp || !envId) return;
    if (!window.confirm(`sets/${name} 로 지문 ${parsed.length}개의 5종 세트 제작을 시작할까요?\n\n제작 세션이 새로 열리고 대표님의 Claude 사용량을 써요.`)) return;
    setBusy("start");
    setError("");
    try {
      localStorage.setItem(ENV_KEY, envId);
    } catch {
      // 환경 기억은 편의 기능
    }
    try {
      const prod = await startProduction(mcp, { set: name, exam: order.exam.trim(), grade: order.grade, passages: parsed, envId });
      save(prod);
    } catch (e) {
      const code = (e as { code?: string })?.code;
      setError(
        code === "server_unavailable" || code === "upstream_error" || code === "cancelled"
          ? "세션이 열렸는지 알 수 없어요. claude.ai/code 의 세션 목록을 먼저 확인해 주세요(중복으로 열지 않게)."
          : mcpErrorText(e, REMOTE),
      );
    } finally {
      setBusy("");
    }
  };

  const remove = (p: Production) => {
    if (!window.confirm(`'${p.title || p.id}'을(를) 제작실 목록에서 지울까요? 세션과 파일은 그대로 남아요.`)) return;
    setList((prev) => prev.filter((x) => x.id !== p.id));
    store?.remove(p.id).catch(() => setError("목록에서 지우지 못했어요."));
  };

  const problems = [
    !order.exam.trim() && "작업 지시서에 시험·교재 이름을 넣어 주세요",
    !parsed.length && "작업 지시서에 전 지문을 붙여넣어 주세요",
    !validSetName(name) && "묶음 폴더 이름은 영어 소문자·숫자·- 로 (예: 2026-10-g2)",
    duplicate && "같은 묶음 폴더로 진행 중인 제작이 있어요 — 아래 목록에서 이어서 보세요",
    !envId && "실행 환경을 골라 주세요",
  ].filter(Boolean) as string[];

  return (
    <section className="win production-room" id="production-room">
      <div className="win-bar">
        <span>🏭 production.room — 제작실 (판매용 PDF)</span>
        <span className="window-controls">—　▢　✕</span>
      </div>
      <div className="win-body">
        {remote !== "ready" || !mcp ? (
          <div className={`ai-note ${remote === "checking" ? "checking" : "off"}`}>
            {remote === "checking" ? (
              <b>제작실 연결 확인 중…</b>
            ) : (
              <>
                <b>제작실 꺼짐</b> 판매용 PDF는 제작기 저장소의 Claude Code 세션이 만들어요. 이 페이지를 claude.ai에서 열고
                페이지 권한에서 ‘{REMOTE}’ 커넥터를 허락하면 여기서 세션을 열고 승인까지 할 수 있어요.
              </>
            )}
          </div>
        ) : (
          <>
            <div className="ai-note ready">
              <b>검증된 제작기</b> 위 작업 지시서의 시험·교재와 전 지문으로 제작 세션을 열어요. 세션이
              분석지·단어장·워크북·변형문제·서술형 PDF를 만들고 검수한 뒤 보고하면, 대표님이 확인하고 ‘승인 → 판매 등록’을
              누를 때만 판매 파일 드라이브에 올려요.
            </div>
            <div className="order-grid two">
              <label>
                <span>
                  묶음 폴더 <small>제작기 sets/ 아래 이름 — 예: 2026-10-g2</small>
                </span>
                <input
                  value={name}
                  onChange={(e) => {
                    setTouched(true);
                    setSetName(e.target.value.trim().toLowerCase());
                  }}
                  placeholder="2026-10-g2"
                />
              </label>
              <label>
                <span>실행 환경</span>
                {envs ? (
                  <select value={envId} onChange={(e) => setEnvId(e.target.value)}>
                    {envs.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name}
                        {e.description ? ` — ${e.description}` : ""}
                      </option>
                    ))}
                  </select>
                ) : (
                  <button className="text-button" onClick={loadEnvs} disabled={busy !== ""}>
                    {busy === "env" ? "불러오는 중…" : "환경 불러오기 (처음 한 번 허락)"}
                  </button>
                )}
              </label>
            </div>
            <div className="order-actions">
              <button className="btn" onClick={start} disabled={busy !== "" || problems.length > 0}>
                {busy === "start" ? "세션 여는 중…" : `🏭 지문 ${parsed.length}개 5종 세트 제작 맡기기`}
              </button>
              <span className="order-hint">
                {problems.length ? problems[0] : "세션에서 지문 수에 따라 1~3시간 걸려요. 이 창을 닫아도 계속 만들어요."}
              </span>
            </div>
            {error ? <p className="prod-error">{error}</p> : null}
            {list.length ? (
              <ul className="prod-list">
                {list.map((p) => (
                  <ProductionRow
                    key={`${p.id}:${p.sessionId}`}
                    mcp={mcp}
                    prod={p}
                    onSave={save}
                    onRemove={remove}
                    onReport={(prod, text) => setReport({ prod, text })}
                    onView={onView}
                  />
                ))}
              </ul>
            ) : null}
            {!store ? <p className="prod-hint">이 화면에서는 제작 기록을 저장하지 못해요. 세션 주소는 claude.ai/code 에서도 볼 수 있어요.</p> : null}
            <details className="order-memo">
              <summary>처음 한 번 준비할 것 (드라이브 자동 업로드)</summary>
              <ol className="prod-setup">
                <li>제작기 저장소에서 서술형·자동 업로드가 들어간 작업을 홈페이지 작업 브랜치에 합쳐 두기</li>
                <li>관리자 페이지 ‘설정’ 탭의 ‘자동 업로드’ 값을 Claude 환경 설정의 환경 변수 VERRU_UPLOAD_SECRET 에 넣기</li>
                <li>같은 환경의 네트워크 허용 도메인에 script.google.com, script.googleusercontent.com 추가</li>
                <li>주문 서버(Apps Script)에 새 코드를 붙여넣고 새 버전으로 배포</li>
              </ol>
            </details>
          </>
        )}
      </div>
      {report ? (
        <div className="modal-backdrop" onClick={() => setReport(null)}>
          <section
            className="win team-modal doc-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="제작 세션 최근 보고"
          >
            <div className="win-bar">
              <span>📋 {report.prod.title || report.prod.id} — 제작 세션 최근 보고</span>
              <button className="window-close" onClick={() => setReport(null)}>
                ✕
              </button>
            </div>
            <div className="win-body">
              <MarkdownView source={report.text} />
              <p className="prod-hint">
                PDF는 세션에서 받아 볼 수 있어요 →{" "}
                <a href={sessionUrl(report.prod.sessionId)} target="_blank" rel="noreferrer">
                  세션 열기
                </a>
              </p>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}
