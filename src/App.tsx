import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import OfficeWorld from "./game/OfficeWorld";
import { buildReport, reportToText } from "./game/report";
import { Company, PHASES, type Agent, type DeptStatus, type Snapshot } from "./game/sim";
import { BLOCK_NEED, CEO, DEPT_BRIEF, DEPT_LEAD, STAFF } from "./game/staff";
import { DEPT_ROOMS } from "./game/world";
import { LINK_ROWS } from "./links";
import { getDb, getDownloads, getPermissions, getSample, inClaude, type Downloads, type SampleFn } from "./ai/claude";
import { GLOBAL_ORDER, PART_ORDER, SALE_PARTS, WorkJob, fileNameFor, type OrderInput, type RunData } from "./ai/job";
import { parsePassages } from "./ai/passages";
import { RunStore, summarize, type RunSummary } from "./ai/store";
import { DocModal, OutputsPanel, SetModal, WorkOrder, estimate, saleReadyCount, type AiState, type DocRef } from "./Work";
import { COMPANY, STORAGE_LINK, TODAY_PICK } from "../company.config";

type View = "live" | "dashboard";

const statusClass: Record<DeptStatus, string> = {
  "완료": "done",
  "진행 중": "working",
  "승인 대기": "approval",
  "연동 대기": "blocked",
  "대기": "waiting",
};

const HEADCOUNT = STAFF.length;
const SECRETARY = DEPT_LEAD.secretary;
const BLOCK_NEEDS = Object.values(BLOCK_NEED);
/** 대표 승인 회의에 올라오는 팀장들 (자료기획 · 분석지 · 비서실) */
const APPROVERS = [DEPT_LEAD.strategy1, DEPT_LEAD.strategy2, DEPT_LEAD.secretary].map((s) => s.name).join("·");

const EMPTY_ORDER: OrderInput = { exam: "", grade: "고2", passages: "", memo: "" };
const DRAFT_KEY = "verru-work-order";

/** 작성 중이던 작업 지시서 (이 브라우저에만 보관) */
function loadDraft(): OrderInput {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as Partial<OrderInput> & { passage?: string };
      return { ...EMPTY_ORDER, ...saved, passages: saved.passages ?? saved.passage ?? "" };
    }
  } catch {
    // 저장소를 못 쓰는 환경이면 빈 지시서로 시작
  }
  return EMPTY_ORDER;
}

/** 결재 카드에 올릴 안건 — 실제 작업이면 자료기획팀 계획, 연습 모드면 예시 안건 */
function pickFor(run: RunData | null) {
  if (!run) {
    return { badge: `TOP 1 제안 · ${TODAY_PICK.score}점`, title: TODAY_PICK.title, summary: TODAY_PICK.summary, reasons: TODAY_PICK.reasons, real: false };
  }
  const plan = run.plan;
  const n = run.passages.length;
  const est = estimate(n, Boolean(run.order.memo.trim()));
  return {
    badge: `전 지문 ${n}개 · 5종${plan ? ` · 난이도 ${plan.difficulty}` : ""}`,
    title: run.productName,
    summary: `${plan?.summary || "계획 작성에 실패했어요. 지문으로 바로 5종 세트를 만들 수 있어요."} 승인하면 AI 작업 약 ${est.calls}번, ${est.min}~${est.max}분 걸려요.`,
    reasons: plan ? plan.points.map((point, i) => `${"①②③"[i] ?? "·"} ${point}`) : [],
    real: true,
  };
}

const runPending = (run: RunData | null) =>
  Boolean(
    run &&
      (GLOBAL_ORDER.some((id) => run.global[id].status === "running") ||
        run.passages.some((p) => PART_ORDER.some((id) => p.parts[id].status === "running"))),
  );

function todayLabel() {
  const d = new Date();
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

function PixelEmployee({ hair, shirt, accent }: { hair: string; shirt: string; accent: string }) {
  const style = {
    "--pixel-hair": hair,
    "--pixel-shirt": shirt,
    "--pixel-accent": accent,
  } as CSSProperties;
  return (
    <span className="pixel-employee" style={style} aria-hidden="true">
      <i className="pixel-shadow" />
      <i className="pixel-legs" />
      <i className="pixel-body" />
      <i className="pixel-arm left" />
      <i className="pixel-arm right" />
      <i className="pixel-face">
        <b className="pixel-eyes" />
      </i>
      <i className="pixel-hair" />
      <i className="pixel-headset" />
    </span>
  );
}

export default function Home() {
  const [engine] = useState(() => new Company());
  const [snap, setSnap] = useState<Snapshot>(() => engine.snapshot());
  const [view, setView] = useState<View>("live");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [follow, setFollow] = useState(true);
  const [briefing, setBriefing] = useState(false);
  const [filter, setFilter] = useState<"전체" | DeptStatus>("전체");
  const [toast, setToast] = useState("");
  const [copied, setCopied] = useState(false);
  /** 클립보드 복사가 막힌 환경(일부 앱 화면)에서 직접 복사하도록 보여줄 글 */
  const [manualCopy, setManualCopy] = useState<string | null>(null);
  const publishedRef = useRef(false);

  // ── 실제 업무: AI 연결 · 저장소 · 파일 저장 ──
  const [ai, setAi] = useState<AiState>("checking");
  const [canSave, setCanSave] = useState(false);
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [order, setOrder] = useState<OrderInput>(loadDraft);
  const parsed = useMemo(() => parsePassages(order.passages), [order.passages]);
  /** 열려 있는 세트 창 — 창고에서 연 세트는 지문 전문을 불러와 data 에 담는다 */
  const [openSet, setOpenSet] = useState<{ id: string; data: RunData | null } | null>(null);
  const [doc, setDoc] = useState<{ runId: string; ref: DocRef } | null>(null);
  /** PDF 만드는 중 안내 (비어 있으면 한가함) */
  const [busy, setBusy] = useState("");
  const sampleRef = useRef<SampleFn | null>(null);
  const downloadsRef = useRef<Downloads | null>(null);
  const storeRef = useRef<RunStore | null>(null);

  useEffect(() => {
    let alive = true;
    let unsubscribe = () => {};
    void (async () => {
      const [sample, db, downloads] = await Promise.all([getSample(), getDb(), getDownloads()]);
      if (!alive) return;
      sampleRef.current = sample;
      downloadsRef.current = downloads;
      setAi(sample ? "ready" : "off");
      // Claude 밖(로컬 실행)에서는 브라우저 다운로드로 저장한다
      setCanSave(Boolean(downloads) || !inClaude());
      if (db) {
        const store = new RunStore(db);
        storeRef.current = store;
        unsubscribe = store.subscribe(setRuns, () => {
          storeRef.current = null;
        });
      }
    })();
    return () => {
      alive = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(order));
      } catch {
        // 저장소를 못 쓰면 그냥 넘어간다
      }
    }, 400);
    return () => window.clearTimeout(timer);
  }, [order]);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    const loop = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      engine.tick(dt);
      acc += dt;
      if (acc >= 0.18) {
        acc = 0;
        setSnap(engine.snapshot());
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [engine]);

  useEffect(() => {
    engine.setBriefingHandler(() => setBriefing(true));
    return () => engine.setBriefingHandler(null);
  }, [engine]);

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2400);
  }, []);

  const onSelect = useCallback((agent: Agent) => setSelectedId(agent.id), []);

  const copy = useCallback(
    async (text: string, done: string) => {
      try {
        await navigator.clipboard.writeText(text);
        showToast(done);
      } catch {
        setManualCopy(text);
      }
    },
    [showToast],
  );

  /** 파일 저장 — Claude 페이지에선 저장 확인 창, 로컬에선 브라우저 다운로드 */
  const saveBlob = useCallback(
    async (blob: Blob, filename: string) => {
      const downloads = downloadsRef.current;
      if (downloads) {
        try {
          const result = await downloads.save({ filename, data: blob });
          if (result.status === "saved") showToast(`${filename} 저장했어요`);
        } catch (error) {
          const code = (error as { code?: string })?.code;
          if (code === "declined") return;
          showToast(code === "rate_limited" ? "저장 확인 창이 이미 열려 있어요" : "저장하지 못했어요. 다시 눌러주세요.");
        }
        return;
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 2000);
      showToast(`${filename} 저장했어요`);
    },
    [showToast],
  );

  const saveDocx = useCallback(
    async (run: RunData, markdown: string, part: string) => {
      // 워드 파일 도구는 무거워서 저장할 때만 불러온다
      const { buildDocx } = await import("./ai/docx");
      const blob = await buildDocx([{ markdown }], `${COMPANY.reportName} · ${STORAGE_LINK.replace(/^https?:\/\//, "")}`);
      await saveBlob(blob, fileNameFor(run.order, part, "docx"));
    },
    [saveBlob],
  );

  /** PDF 만들기 — 한 번에 하나씩, 진행 상황을 보여준다 */
  const makePdf = useCallback(
    async (label: string, make: (pdf: typeof import("./ai/pdf")) => Promise<{ blob: Blob; name: string }>) => {
      if (busy) return;
      setBusy(`${label} 만드는 중…`);
      try {
        const pdf = await import("./ai/pdf");
        const { blob, name } = await make(pdf);
        await saveBlob(blob, name);
      } catch (error) {
        showToast(`PDF를 만들지 못했어요 — ${error instanceof Error ? error.message : "다시 눌러주세요"}`);
      } finally {
        setBusy("");
      }
    },
    [busy, saveBlob, showToast],
  );

  /** 지금 돌고 있는 작업이면 화면 스냅샷, 아니면 창고에서 불러온 세트 */
  const findRun = (id: string): RunData | null =>
    snap.job?.id === id ? snap.job : openSet?.id === id ? openSet.data : null;

  const openStoredSet = (summary: RunSummary) => {
    if (snap.job?.id === summary.id) {
      setOpenSet({ id: summary.id, data: null });
      return;
    }
    const store = storeRef.current;
    if (!store) return;
    setOpenSet({ id: summary.id, data: null });
    showToast("결과물을 불러오는 중이에요…");
    store
      .load(summary)
      .then((data) => setOpenSet((cur) => (cur?.id === summary.id ? { id: summary.id, data } : cur)))
      .catch(() => {
        setOpenSet(null);
        showToast("결과물을 불러오지 못했어요. 다시 눌러주세요.");
      });
  };

  /** 멈췄거나 덜 된 세트를 사무실에서 이어서 만든다 */
  const resumeSet = (run: RunData) => {
    if (snap.running) {
      showToast("지금 업무 중이에요. 오늘 업무가 끝난 뒤 이어서 만들 수 있어요.");
      return;
    }
    if (ai !== "ready") {
      showToast("이 화면에선 AI를 쓸 수 없어요.");
      return;
    }
    void getPermissions()
      .then((permissions) => permissions?.request(["sample"]))
      .catch(() => undefined);
    engine.start(WorkJob.restore(run, sampleRef.current, storeRef.current));
    setOpenSet(null);
    setBriefing(false);
    setView("live");
    showToast("남은 자료를 이어서 만들어요 — 이미 만든 건 그대로 둬요");
  };

  /** 오늘 브리핑을 텍스트로 만들어 클립보드에 복사한다 (카톡·노션 어디든 붙여넣기) */
  const sendReport = useCallback(
    async (auto: boolean) => {
      if (auto) {
        engine.pushLog("📋", "오늘 브리핑 정리 완료 — ‘📤 보고 복사’를 누르면 텍스트로 복사돼요", "mint");
        return;
      }
      const text = reportToText(buildReport(engine.snapshot()));
      try {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        engine.pushLog("📤", "오늘 브리핑을 클립보드에 복사했어요", "mint");
        showToast("브리핑 복사 완료 — 카톡·노션 어디든 붙여넣으세요");
      } catch {
        setManualCopy(text);
      }
    },
    [engine, showToast],
  );

  // 하루가 끝나면 자동으로 한 번 발행한다
  useEffect(() => {
    if (snap.dayComplete && !publishedRef.current) {
      publishedRef.current = true;
      void sendReport(true);
    }
    if (!snap.dayComplete && snap.running) publishedRef.current = false;
  }, [snap.dayComplete, snap.running, sendReport]);

  const askAgent = useCallback(
    (agent: Agent) => {
      engine.command(`${agent.name} 지금 뭐해?`);
      setSelectedId(null);
      window.setTimeout(
        () => document.getElementById("ceo-console")?.scrollIntoView({ behavior: "smooth", block: "center" }),
        60,
      );
    },
    [engine],
  );

  const start = () => {
    if (snap.running) return;
    if (ai === "checking") {
      showToast("AI 연결을 확인하는 중이에요. 잠깐 뒤에 다시 눌러주세요.");
      return;
    }
    if (ai === "ready") {
      const short = parsed.filter((p) => p.words < 20);
      if (!parsed.length || short.length) {
        setView("live");
        showToast(
          parsed.length
            ? `너무 짧은 지문이 있어요 (${short.map((p) => p.label).join(", ")}) — 번호 줄을 확인해주세요`
            : "작업 지시서에 전 지문을 붙여넣어 주세요",
        );
        window.setTimeout(() => {
          document.getElementById("work-order")?.scrollIntoView({ behavior: "smooth", block: "center" });
          document.getElementById("order-passage")?.focus();
        }, 60);
        return;
      }
      // AI 사용 허락은 버튼을 누른 지금 묻는다 (일하던 도중에 갑자기 뜨지 않게)
      void getPermissions()
        .then((permissions) => permissions?.request(["sample"]))
        .catch(() => undefined);
      engine.start(new WorkJob({ ...order }, parsed, sampleRef.current, storeRef.current));
      showToast(`07:00 — AI 직원 ${HEADCOUNT}명이 출근해서 지문 ${parsed.length}개 5종 세트를 만듭니다 ✨`);
    } else {
      engine.start(null);
      showToast("연습 모드로 출근합니다 — 이 화면에선 실제 자료는 만들어지지 않아요");
    }
    setBriefing(false);
    setView("live");
  };

  const approve = () => {
    engine.approve();
    showToast("승인 완료! 제작팀이 바로 움직여요");
  };

  const teams = useMemo(
    () =>
      DEPT_ROOMS.map((room) => {
        const lead = DEPT_LEAD[room.id];
        const status = snap.deptStatus[room.id] ?? "대기";
        return {
          id: room.id,
          icon: room.icon,
          name: room.name,
          room: room.short,
          lead,
          status,
          ...DEPT_BRIEF[room.id],
        };
      }),
    [snap.deptStatus],
  );

  const filteredTeams = filter === "전체" ? teams : teams.filter((team) => team.status === filter);
  const selected = selectedId ? engine.agentById.get(selectedId) ?? null : null;
  const todo = snap.approvalPending ? 1 : 0;
  const onDuty = engine.agents.filter((a) => a.status !== "출근 전").length;

  return (
    <main className="page-shell">
      <div className="wrap">
        <nav className="app-nav" aria-label="AI Company 화면 전환">
          <div className="brand-chip">
            <span>{COMPANY.logoLetter}</span>
            <b>{COMPANY.name}</b>
          </div>
          <div className="nav-tabs">
            <button className={view === "live" ? "active" : ""} onClick={() => setView("live")}>
              🎮 라이브 오피스
            </button>
            <button className={view === "dashboard" ? "active" : ""} onClick={() => setView("dashboard")}>
              📊 대시보드
            </button>
            <button
              className={`todo-tab ${todo ? "urgent" : ""}`}
              onClick={() => {
                setView("live");
                window.setTimeout(
                  () => document.getElementById("ceo-approval")?.scrollIntoView({ behavior: "smooth", block: "center" }),
                  60,
                );
              }}
            >
              📋 대표 할 일 <i>{todo}</i>
            </button>
          </div>
        </nav>

        {view === "live" ? (
          <LiveView
            engine={engine}
            snap={snap}
            follow={follow}
            setFollow={setFollow}
            selectedId={selectedId}
            onSelect={onSelect}
            onStart={start}
            onApprove={approve}
            onDuty={onDuty}
            onPublish={() => void sendReport(false)}
            copied={copied}
            ai={ai}
            order={order}
            setOrder={setOrder}
            parsed={parsed}
            onOpenDoc={(ref) => snap.job && setDoc({ runId: snap.job.id, ref })}
            onOpenSet={() => snap.job && setOpenSet({ id: snap.job.id, data: null })}
            onStopWork={() => engine.job?.cancel()}
          />
        ) : (
          <DashboardView
            teams={teams}
            filteredTeams={filteredTeams}
            filter={filter}
            setFilter={setFilter}
            snap={snap}
            onStart={start}
            onApprove={approve}
            onSelect={(id) => setSelectedId(id)}
            runs={snap.job && !runs.some((r) => r.id === snap.job!.id) ? [summarize(snap.job), ...runs] : runs}
            liveId={snap.job && runPending(snap.job) ? snap.job.id : null}
            stored={Boolean(storeRef.current)}
            onOpenRun={(summary) => (summary.id === snap.job?.id ? setOpenSet({ id: summary.id, data: null }) : openStoredSet(summary))}
          />
        )}

        <footer>
          이 툴은 갓생맘 🎀이 만들었어요
          <br />
          <a href="https://www.instagram.com/godseng.mom/" target="_blank" rel="noreferrer">
            📷 @godseng.mom — 더 많은 크리에이터 툴 보러가기 →
          </a>
          <br />© godseng.mom · 자유롭게 쓰되 무단 재판매 금지
        </footer>
      </div>

      {selected ? (
        <ProfileModal
          agent={selected}
          onClose={() => setSelectedId(null)}
          onAsk={(agent) => {
            setView("live");
            askAgent(agent);
          }}
        />
      ) : null}
      {briefing ? (
        <BriefingModal
          snap={snap}
          onClose={() => setBriefing(false)}
          onOpenBriefing={() => {
            setBriefing(false);
            if (snap.job) setDoc({ runId: snap.job.id, ref: { kind: "global", id: "briefing" } });
          }}
        />
      ) : null}
      {openSet && findRun(openSet.id) ? (
        <SetModal
          run={findRun(openSet.id)!}
          busy={busy}
          canSave={canSave}
          canResume={ai === "ready" && !snap.running}
          live={snap.job?.id === openSet.id}
          onOpenDoc={(ref) => setDoc({ runId: openSet.id, ref })}
          onPassagePdf={(key) => {
            const run = findRun(openSet.id)!;
            const passage = run.passages.find((p) => p.key === key)!;
            void makePdf(`${passage.label} PDF`, async (pdf) => ({
              blob: await pdf.passagePdf(run, passage),
              name: pdf.passagePdfName(run, passage),
            }));
          }}
          onCombinedPdf={() => {
            const run = findRun(openSet.id)!;
            void makePdf("전 지문 통합 PDF", async (pdf) => ({ blob: await pdf.combinedPdf(run), name: pdf.combinedPdfName(run) }));
          }}
          onBundle={() => {
            const run = findRun(openSet.id)!;
            void makePdf("PDF 묶음", async (pdf) => ({
              blob: await pdf.bundleZip(run, (done, total) => setBusy(`PDF 만드는 중… ${done}/${total}`)),
              name: fileNameFor(run.order, "전지문_5종_PDF묶음", "zip"),
            }));
          }}
          onResume={() => resumeSet(findRun(openSet.id)!)}
          onDelete={
            storeRef.current && snap.job?.id !== openSet.id
              ? () => {
                  const summary = runs.find((r) => r.id === openSet.id);
                  if (summary)
                    void storeRef.current?.remove(summary).catch(() => showToast("지우지 못했어요. 다시 눌러주세요."));
                  setOpenSet(null);
                }
              : null
          }
          onClose={() => setOpenSet(null)}
        />
      ) : null}
      {doc && findRun(doc.runId) ? (
        <DocModal
          run={findRun(doc.runId)!}
          doc={doc.ref}
          canSave={canSave}
          canRerun={engine.job?.id === doc.runId && ai === "ready"}
          onRerun={() => {
            const job = engine.job;
            if (!job) return;
            job.clearHalt();
            if (doc.ref.kind === "global") void job.runGlobal(doc.ref.id, true);
            else void job.runPart(doc.ref.key, doc.ref.id, true);
          }}
          onCopy={(text, done) => void copy(text, done)}
          onSaveDocx={(markdown, part) => void saveDocx(findRun(doc.runId)!, markdown, part)}
          onClose={() => setDoc(null)}
        />
      ) : null}
      {manualCopy !== null ? <CopyModal text={manualCopy} onClose={() => setManualCopy(null)} /> : null}
      <div className={`toast ${toast ? "show" : ""}`} role="status">
        {toast}
      </div>
    </main>
  );
}

function LiveView({
  engine,
  snap,
  follow,
  setFollow,
  selectedId,
  onSelect,
  onStart,
  onApprove,
  onDuty,
  onPublish,
  copied,
  ai,
  order,
  setOrder,
  parsed,
  onOpenDoc,
  onOpenSet,
  onStopWork,
}: {
  engine: Company;
  snap: Snapshot;
  follow: boolean;
  setFollow: (value: boolean) => void;
  selectedId: string | null;
  onSelect: (agent: Agent) => void;
  onStart: () => void;
  onApprove: () => void;
  onDuty: number;
  onPublish: () => void;
  copied: boolean;
  ai: AiState;
  order: OrderInput;
  setOrder: (next: OrderInput) => void;
  parsed: ReturnType<typeof parsePassages>;
  onOpenDoc: (ref: DocRef) => void;
  onOpenSet: () => void;
  onStopWork: () => void;
}) {
  const pick = pickFor(snap.job);
  const progress = Math.round((snap.phaseIndex / (PHASES.length - 1)) * 100);

  return (
    <>
      <header className="live-hero">
        <div>
          <p className="eyebrow">LIVE OFFICE · {HEADCOUNT} AI STAFF · REAL-TIME</p>
          <h1>
            {COMPANY.titlePrefix} <em className="highlight">{COMPANY.titleAccent}</em>
          </h1>
          <p>수요조사부터 분석지·워크북·변형문제·서술형 제작, 검수, 상세페이지·홍보까지 — 직원들이 출근해서 일하고 대표실로 보고하러 갑니다.</p>
        </div>
        <div className="live-clock">
          <span>SEOUL</span>
          <b>{snap.clock}</b>
          <small>{snap.phase}</small>
        </div>
      </header>

      <section className="live-bar">
        <button className="btn btn-primary" onClick={onStart} disabled={snap.running}>
          {snap.running ? "직원들이 일하는 중…" : snap.dayComplete ? "다시 출근시키기" : "오늘 업무 시작하기"}
        </button>
        <button className="btn btn-ghost" onClick={() => engine.togglePause()}>
          {snap.paused ? "▶ 재생" : "⏸ 일시정지"}
        </button>
        <div className="speed-wrap">
          <span className="speed-label" title="시뮬레이션 전체(걷기·업무·대사)가 함께 빨라져요. 실제 외부 작업 속도와는 무관합니다.">
            재생 속도
          </span>
          <div className="speed-group" role="group" aria-label="재생 속도">
            {[1, 2, 4].map((value) => (
              <button
                key={value}
                className={!snap.turbo && snap.speed === value ? "on" : ""}
                onClick={() => engine.setSpeed(value)}
                title={value === 1 ? "말풍선 읽기·화면녹화용" : value === 4 ? "결과만 빠르게" : "기본"}
              >
                {value}x
              </button>
            ))}
            <button
              className={`skip ${snap.turbo ? "on" : ""}`}
              onClick={() => engine.skipToDecision()}
              disabled={!snap.running || snap.approvalPending}
              title="대표님이 결정할 일이 생길 때까지 단숨에 건너뜁니다"
            >
              {snap.turbo ? "건너뛰는 중…" : "⏭ 결정까지"}
            </button>
          </div>
        </div>
        <button className={`btn btn-ghost ${follow ? "on" : ""}`} onClick={() => setFollow(!follow)}>
          🎥 자동 추적 {follow ? "ON" : "OFF"}
        </button>
        <button
          className={`btn btn-ghost publish-btn ${copied ? "sent" : ""}`}
          onClick={onPublish}
          title="오늘 브리핑을 텍스트로 클립보드에 복사합니다"
        >
          📤 보고 복사
        </button>
        <div className="live-progress">
          <span>
            {snap.phase} · {progress}%
          </span>
          <i>
            <b style={{ width: `${progress}%` }} />
          </i>
        </div>
        <div className="live-counts">
          <span className="lc on-duty">근무 {onDuty}</span>
          <span className="lc done">완료 {snap.stats.done}</span>
          <span className="lc working">진행 {snap.stats.working}</span>
          <span className="lc blocked">연동대기 {snap.stats.blocked}</span>
        </div>
      </section>

      <WorkOrder order={order} setOrder={setOrder} parsed={parsed} ai={ai} locked={snap.running} />

      <section className="live-grid">
        <OfficeWorld engine={engine} snap={snap} selectedId={selectedId} follow={follow} onSelect={onSelect} />

        <aside className="live-rail">
          <OutputsPanel
            run={snap.job}
            ai={ai}
            pending={(engine.job?.pending() ?? 0) > 0}
            onOpenDoc={onOpenDoc}
            onOpenSet={onOpenSet}
            onStop={onStopWork}
          />

          <CeoConsole engine={engine} snap={snap} />

          <section className="win rail-card" id="ceo-approval">
            <div className="win-bar">
              <span>✅ ceo.approval</span>
              <span className="window-controls">—　▢　✕</span>
            </div>
            <div className={`win-body approval-body ${snap.approvalPending ? "pending" : ""}`}>
              {snap.approvalPending ? (
                <>
                  <div className="approval-top">
                    <span className="mini-badge yellow">{pick.badge}</span>
                    <span className="score blink">결재 대기</span>
                  </div>
                  <h3>{pick.title}</h3>
                  <p>{pick.real ? pick.summary : `회의실에서 ${APPROVERS}가 대표님을 기다리고 있어요.`}</p>
                  <div className="reason-list">
                    {pick.reasons.map((reason) => (
                      <span key={reason}>{reason}</span>
                    ))}
                  </div>
                  {pick.real ? (
                    <button className="text-button" onClick={() => onOpenDoc({ kind: "global", id: "plan" })}>
                      제작 계획 자세히 보기
                    </button>
                  ) : null}
                  <button className="btn approve-button" onClick={onApprove}>
                    {pick.real ? "이 계획으로 제작 승인" : "이 자료 세트 승인하기"}
                  </button>
                </>
              ) : (
                <>
                  <div className="approval-top">
                    <span className="mini-badge mint">{snap.approved ? "오늘 결재 완료" : "결재 대기 없음"}</span>
                  </div>
                  <h3>{snap.approved ? (snap.job ? `‘${snap.job.productName}’ 제작 중이에요` : "승인하신 안으로 제작 중이에요") : "아직 올라온 안건이 없어요"}</h3>
                  <p>
                    {snap.approved
                      ? "분석지·단어장 → 워크북·변형·서술형 → 검수 → 상세페이지·홍보 → 등록 준비까지 이어집니다."
                      : ai === "ready"
                        ? "지문을 넣고 업무를 시작하면 자료기획팀이 제작 계획을 회의실로 올려요."
                        : "업무를 시작하면 자료기획팀이 TOP 3를 회의실로 올려요."}
                  </p>
                </>
              )}
            </div>
          </section>

          <section className="win rail-card feed-card">
            <div className="win-bar">
              <span>📡 live.feed</span>
              <span className="window-controls">—　▢　✕</span>
            </div>
            <div className="win-body feed-body">
              {snap.meetingTitle ? <div className="feed-now">💬 회의 진행 중 — {snap.meetingTitle}</div> : null}
              <ul className="feed-list">
                {snap.log.map((entry) => (
                  <li key={entry.id} className={entry.tone}>
                    <b>{entry.time}</b>
                    <i>{entry.icon}</i>
                    <span>{entry.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          <section className="win rail-card">
            <div className="win-bar">
              <span>👥 staff.roster</span>
              <span className="window-controls">—　▢　✕</span>
            </div>
            <div className="win-body roster-body">
              {DEPT_ROOMS.map((room) => (
                <div className="roster-dept" key={room.id}>
                  <p>
                    <b>
                      {room.icon} {room.name}
                    </b>
                    <i className={`rm-dot ${statusClass[snap.deptStatus[room.id] ?? "대기"]}`} />
                  </p>
                  <div className="roster-chips">
                    {STAFF.filter((s) => s.deptId === room.id).map((seed) => {
                      const agent = engine.agentById.get(seed.id);
                      return (
                        <button
                          key={seed.id}
                          className={`roster-chip ${selectedId === seed.id ? "on" : ""}`}
                          onClick={() => agent && onSelect(agent)}
                        >
                          <i style={{ background: seed.shirt, borderColor: seed.hair }} />
                          {seed.name}
                          <small>{agent?.status ?? "출근 전"}</small>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </section>
    </>
  );
}

const QUICK_ORDERS = [
  { label: "현황 보고", command: "현황 보고해줘" },
  { label: "왜 늦어져?", command: "왜 늦어지고 있어?" },
  { label: "회의 소집", command: "전 부서 회의 소집" },
  { label: "지금 브리핑", command: "지금 브리핑 올라와" },
  { label: "집중 모드", command: "집중 모드" },
  { label: "속도 올려", command: "속도 좀 올려줘" },
];

function CeoConsole({ engine, snap }: { engine: Company; snap: Snapshot }) {
  const [draft, setDraft] = useState("");
  const logRef = useRef<HTMLDivElement>(null);
  const count = snap.chat.length;

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [count]);

  const send = (text: string) => {
    const value = text.trim();
    if (!value) return;
    engine.command(value);
    setDraft("");
  };

  return (
    <section className="win rail-card console-card" id="ceo-console">
      <div className="win-bar">
        <span>🎤 ceo.console — 대표 지시창</span>
        <span className="window-controls">—　▢　✕</span>
      </div>
      <div className="win-body console-body">
        <div className="console-status">
          <span className={`mini-badge ${snap.focusMode ? "yellow" : "mint"}`}>
            {snap.focusMode ? "집중 모드 ON" : "평시 운영"}
          </span>
          {snap.busyWithOrder ? <span className="mini-badge lav">지시 처리 중…</span> : null}
        </div>

        <div className="console-log" ref={logRef}>
          {snap.chat.map((entry) => (
            <div key={entry.id} className={`console-line ${entry.from}`}>
              <b>{entry.from === "ceo" ? "대표님" : entry.name}</b>
              <p>{entry.text}</p>
              <small>{entry.time}</small>
            </div>
          ))}
        </div>

        <div className="console-quick">
          {QUICK_ORDERS.map((item) => (
            <button key={item.label} onClick={() => send(item.command)}>
              {item.label}
            </button>
          ))}
        </div>

        <form
          className="console-input"
          onSubmit={(event) => {
            event.preventDefault();
            send(draft);
          }}
        >
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="예: 마케팅팀 지금 뭐해? / 왜 늦어져?"
            aria-label="대표 지시 입력"
          />
          <button type="submit">지시</button>
        </form>
      </div>
    </section>
  );
}

function ProfileModal({
  agent,
  onClose,
  onAsk,
}: {
  agent: Agent;
  onClose: () => void;
  onAsk: (agent: Agent) => void;
}) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        className="win team-modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`${agent.name} 프로필`}
      >
        <div className="win-bar">
          <span>👤 employee_profile.exe</span>
          <button className="window-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="win-body employee-profile">
          <div className="profile-top">
            <PixelEmployee hair={agent.hair} shirt={agent.shirt} accent={agent.accent} />
            <div>
              <span className="status-pill working">{agent.status}</span>
              <h2>
                {agent.name}
                {agent.callsign ? <small> · {agent.callsign}</small> : null}
              </h2>
              <p>{agent.role}</p>
            </div>
          </div>
          <div className="profile-task">
            <span className="tiny-label">지금 하는 일</span>
            <strong>{agent.taskLabel}</strong>
            {agent.anim === "type" ? (
              <span className="profile-progress">
                <i style={{ width: `${Math.round(agent.progress * 100)}%` }} />
              </span>
            ) : null}
          </div>
          <div className="report-box">
            <span className="tiny-label">한마디</span>
            <strong>{agent.speech ?? agent.thoughts[0]}</strong>
          </div>
          <div className="profile-actions">
            <button className="btn btn-primary" onClick={() => onAsk(agent)}>
              🎤 지금 뭐 하는지 물어보기
            </button>
            <button className="text-button" onClick={onClose}>
              닫기
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function BriefingModal({
  snap,
  onClose,
  onOpenBriefing,
}: {
  snap: Snapshot;
  onClose: () => void;
  onOpenBriefing: () => void;
}) {
  const run = snap.job;
  const made = run ? saleReadyCount(run) : 0;
  const failed = run ? run.passages.reduce((sum, p) => sum + PART_ORDER.filter((id) => p.parts[id].status === "failed").length, 0) : 0;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        className="win team-modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="비서실 브리핑"
      >
        <div className="win-bar">
          <span>📋 secretary.brief</span>
          <button className="window-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="win-body">
          <p className="brief-date">{snap.clock} · {SECRETARY.name} 비서실장 최종 브리핑</p>
          <h3>대표님, 오늘 회사 업무가 정리됐어요.</h3>
          {run ? (
            <ul>
              <li>
                <span className="dot green" />
                ‘{run.productName}’ — 지문 {run.passages.length}개 중 {made}개 자료 완성
              </li>
              <li>
                <span className={`dot ${failed ? "yellow" : "green"}`} />
                {run.halted
                  ? `중간에 멈췄어요 — ${run.halted}`
                  : failed
                    ? `${failed}건은 실패했어요 — 지문별 결과물에서 다시 만들 수 있어요`
                    : "실패한 작업 없음"}
              </li>
              <li>
                <span className="dot gray" />
                연동 대기 {snap.stats.blocked}팀 — {BLOCK_NEEDS.join(" · ") || "없음"}
              </li>
            </ul>
          ) : (
            <ul>
              <li>
                <span className="dot green" />
                완료 {snap.stats.done}팀 — 연습 모드라 실제 결과물은 없어요
              </li>
              <li>
                <span className="dot gray" />
                연동 대기 {snap.stats.blocked}팀 — 외부 서비스 연결이 필요해요
              </li>
            </ul>
          )}
          <div className="decision-box">
            <span className="tiny-label">대표님이 하실 일</span>
            <strong>
              {run
                ? "검수 보고서 확인 → PDF 받아서 판매 드라이브에 올리기 → 카페·블로그에 홍보글 게시"
                : "없습니다. 내일 07:00에 다시 출근할게요 ✨"}
            </strong>
          </div>
          <div className="profile-actions">
            {run ? (
              <button className="btn btn-primary" onClick={onOpenBriefing}>
                브리핑 문서 보기
              </button>
            ) : null}
            <button className={run ? "text-button" : "btn btn-primary"} onClick={onClose}>
              확인
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function CopyModal({ text, onClose }: { text: string; onClose: () => void }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        className="win team-modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="브리핑 직접 복사"
      >
        <div className="win-bar">
          <span>📤 copy.txt</span>
          <button className="window-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="win-body">
          <p className="brief-date">이 화면에서는 자동 복사가 막혀 있어요</p>
          <h3>아래 글을 길게 눌러 전체 선택 → 복사하세요.</h3>
          <textarea
            id="briefing-copy"
            className="copy-box"
            readOnly
            value={text}
            onFocus={(event) => event.currentTarget.select()}
            autoFocus
          />
          <button className="btn btn-primary" onClick={onClose}>
            닫기
          </button>
        </div>
      </section>
    </div>
  );
}

type TeamRow = {
  id: string;
  icon: string;
  name: string;
  room: string;
  lead: (typeof DEPT_LEAD)[string];
  status: DeptStatus;
  task: string;
  report: string;
};

function DashboardView({
  teams,
  filteredTeams,
  filter,
  setFilter,
  snap,
  onStart,
  onApprove,
  onSelect,
  runs,
  stored,
  liveId,
  onOpenRun,
}: {
  teams: TeamRow[];
  filteredTeams: TeamRow[];
  filter: "전체" | DeptStatus;
  setFilter: (value: "전체" | DeptStatus) => void;
  snap: Snapshot;
  onStart: () => void;
  onApprove: () => void;
  onSelect: (id: string) => void;
  runs: RunSummary[];
  stored: boolean;
  liveId: string | null;
  onOpenRun: (summary: RunSummary) => void;
}) {
  const rows = LINK_ROWS;
  const pick = pickFor(snap.job);

  return (
    <>
      <header className="win hero">
        <div className="win-bar">
          <span>🎀 {COMPANY.windowLabel}</span>
          <span className="window-controls" aria-hidden="true">
            —　▢　✕
          </span>
        </div>
        <div className="hero-body">
          <div className="hero-copy">
            <p className="eyebrow">TODAY · 07:00 AUTO START</p>
            <h1>
              오늘 회사가 어떻게 움직이는지 <em className="highlight">한눈에</em> 보여드려요
            </h1>
            <p>AI는 비서, 결정은 대표님. {teams.length}개 팀 {HEADCOUNT}명이 수요조사부터 분석지·단어장·워크북·변형문제·서술형 제작, 검수, 상세페이지·홍보까지 한 흐름으로 움직여요.</p>
          </div>
          <div className="hero-actions">
            <button className="btn btn-primary" onClick={onStart} disabled={snap.running}>
              {snap.running ? "AI 팀원들이 근무 중…" : "오늘 업무 시작하기"}
            </button>
            <span className="trust-copy">사이트 업로드·카페 게시·결제는 대표님이 직접 해요</span>
          </div>
        </div>
      </header>

      <section className="summary-grid" aria-label="오늘 업무 요약">
        <article className="metric yellow">
          <span>AI 직원</span>
          <strong>{HEADCOUNT}</strong>
          <small>STAFF</small>
        </article>
        <article className="metric mint">
          <span>완료</span>
          <strong>{snap.stats.done}</strong>
          <small>DONE</small>
        </article>
        <article className="metric pink">
          <span>진행 중</span>
          <strong>{snap.stats.working}</strong>
          <small>WORKING</small>
        </article>
        <article className="metric lav">
          <span>대표 확인</span>
          <strong>{snap.stats.approval}</strong>
          <small>APPROVAL</small>
        </article>
        <article className="metric white">
          <span>연동 대기</span>
          <strong>{snap.stats.blocked}</strong>
          <small>WAITING</small>
        </article>
      </section>

      <section className="workspace">
        <aside className="side-stack">
          <section className="win">
            <div className="win-bar">
              <span>⚡ automation.status</span>
              <span className="window-controls">—　▢　✕</span>
            </div>
            <div className="win-body">
              <div className="schedule-card">
                <div>
                  <span className="tiny-label">NEXT RUN</span>
                  <strong>매일 오전 7:00</strong>
                  <p>컴퓨터 지시 없이 하루 업무 시작</p>
                </div>
                <span className="toggle-on">ON</span>
              </div>
              <div className="flow-list">
                {PHASES.slice(1, -1).map((item, index) => (
                  <div className={`flow-row ${snap.phaseIndex > index + 1 ? "past" : ""}`} key={item}>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <b>{item}</b>
                    <i>{snap.phaseIndex === index + 1 ? "●" : snap.phaseIndex > index + 1 ? "✓" : "·"}</i>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="win">
            <div className="win-bar">
              <span>🔗 integrations.link</span>
              <span className="window-controls">—　▢　✕</span>
            </div>
            <div className="win-body integration-list">
              {rows.map((item) =>
                item.href ? (
                  <a key={item.name} href={item.href} target="_blank" rel="noreferrer" className="integration-row">
                    <b>{item.name}</b>
                    <span className={`mini-badge ${item.tone}`}>{item.status}</span>
                  </a>
                ) : (
                  <div key={item.name} className="integration-row">
                    <b>{item.name}</b>
                    <span className={`mini-badge ${item.tone}`}>{item.status}</span>
                  </div>
                ),
              )}
            </div>
          </section>
        </aside>

        <div className="main-stack">
          <section className="win">
            <div className="win-bar">
              <span>🏢 team_office.board</span>
              <span className="window-controls">—　▢　✕</span>
            </div>
            <div className="win-body">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">LIVE OFFICE</p>
                  <h2>{teams.length}개 부서 · 팀장 {teams.length}명 근무 현황</h2>
                </div>
                <div className="filter-tabs" role="group" aria-label="팀 상태 필터">
                  {(["전체", "진행 중", "완료", "승인 대기", "연동 대기"] as const).map((item) => (
                    <button key={item} className={filter === item ? "active" : ""} onClick={() => setFilter(item)}>
                      {item}
                    </button>
                  ))}
                </div>
              </div>
              <div className="team-grid">
                {filteredTeams.map((team) => (
                  <button className="team-card" key={team.id} onClick={() => onSelect(team.lead.id)}>
                    <span className={`status-dot ${statusClass[team.status]}`} aria-hidden="true" />
                    <span className="mini-pixel">
                      <PixelEmployee hair={team.lead.hair} shirt={team.lead.shirt} accent={team.lead.accent} />
                    </span>
                    <span className="team-copy">
                      <b>
                        {team.lead.name} · {team.name}
                      </b>
                      <small>{team.task}</small>
                    </span>
                    <span className={`status-pill ${statusClass[team.status]}`}>{team.status}</span>
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className="two-col">
            <section className="win">
              <div className="win-bar">
                <span>✅ ceo.approval</span>
                <span className="window-controls">—　▢　✕</span>
              </div>
              <div className="win-body approval-body">
                <div className="approval-top">
                  <span className="mini-badge yellow">{pick.badge}</span>
                </div>
                <h3>{pick.title}</h3>
                <p>{pick.summary}</p>
                <button
                  className={`btn approve-button ${snap.approved ? "approved" : ""}`}
                  onClick={onApprove}
                  disabled={!snap.approvalPending}
                >
                  {snap.approved ? "승인 완료 · 분석지팀 전달됨" : snap.approvalPending ? (pick.real ? "이 계획으로 제작 승인" : "이 자료 세트 승인하기") : "대기 중인 안건 없음"}
                </button>
              </div>
            </section>

            <section className="win secretary">
              <div className="win-bar">
                <span>📋 secretary.brief</span>
                <span className="window-controls">—　▢　✕</span>
              </div>
              <div className="win-body">
                <p className="brief-date">{todayLabel()} · {snap.clock} 현재</p>
                <h3>{snap.dayComplete ? "대표님, 오늘 업무가 정리됐어요." : "대표님, 현재 진행 상황이에요."}</h3>
                <ul>
                  <li>
                    <span className="dot green" />
                    {snap.phase} 진행 중 — 완료 {snap.stats.done}팀
                  </li>
                  <li>
                    <span className={`dot ${snap.approvalPending ? "yellow" : "green"}`} />
                    {snap.approvalPending ? "TOP 1 대표 확인 필요" : "대기 중인 결재 없음"}
                  </li>
                  <li>
                    <span className="dot gray" />
                    {BLOCK_NEEDS.length ? `연동 대기 — ${BLOCK_NEEDS.join(" · ")}` : "연동 대기 없음"}
                  </li>
                </ul>
                <div className="decision-box">
                  <span className="tiny-label">대표님이 오늘 결정할 1개</span>
                  <strong>
                    {snap.approvalPending
                      ? "제작 계획을 보고 승인해주세요."
                      : snap.approved
                        ? "결정 완료! 제작팀이 다음 업무를 진행해요."
                        : "아직 올라온 안건이 없어요."}
                  </strong>
                </div>
              </div>
            </section>
          </section>
        </div>
      </section>

      <section className="win storage">
        <div className="win-bar">
          <span>📦 result_storage</span>
          <span className="window-controls">—　▢　✕</span>
        </div>
        <div className="win-body">
          <div className="section-heading">
            <div>
              <p className="eyebrow">RECENT OUTPUTS</p>
              <h2>결과물 창고</h2>
            </div>
            {STORAGE_LINK ? (
              <a className="btn btn-small" href={STORAGE_LINK} target="_blank" rel="noreferrer">
                사이트 열기
              </a>
            ) : null}
          </div>
          <div className="result-table">
            <div className="result-row header">
              <span>결과물 세트</span>
              <span>만든 날</span>
              <span>상태</span>
              <span>바로가기</span>
            </div>
            {runs.length ? (
              runs.map((run) => {
                const total = run.passageIndex.length;
                const done = run.passageIndex.filter((p) => SALE_PARTS.every((id) => p.status[id] === "done")).length;
                const failed = run.passageIndex.filter((p) => SALE_PARTS.some((id) => p.status[id] === "failed")).length;
                const working = liveId === run.id;
                return (
                  <div className="result-row" key={run.id}>
                    <b>{run.productName}</b>
                    <span>{new Date(run.createdAt).toLocaleDateString("ko-KR")}</span>
                    <span className={`status-pill ${working ? "working" : failed ? "blocked" : "done"}`}>
                      {working
                        ? `만드는 중 ${done}/${total}`
                        : run.halted
                          ? `멈춤 ${done}/${total} · 이어서 가능`
                          : failed
                            ? `${done}/${total} 완료 · 실패 ${failed}`
                            : `${done}/${total} 지문 완료`}
                    </span>
                    <span>
                      <button className="mini-open" onClick={() => onOpenRun(run)}>
                        열기
                      </button>
                    </span>
                  </div>
                );
              })
            ) : (
              <p className="outputs-empty">
                아직 만든 자료가 없어요. 라이브 오피스의 작업 지시서에 지문을 넣고 업무를 시작하면 여기에 쌓여요.
              </p>
            )}
          </div>
          {!stored && runs.length ? (
            <p className="dash-note">이 화면에선 저장소를 쓸 수 없어서, 페이지를 닫으면 결과물이 사라져요. 필요한 건 PDF로 받아두세요.</p>
          ) : null}
        </div>
      </section>

      <p className="dash-note">
        대표 {CEO.name}({CEO.callsign}) · AI 직원 {teams.length}개 부서 {HEADCOUNT}명 · 이 화면은 라이브 오피스와 같은 상태를
        공유해요.
      </p>
    </>
  );
}
