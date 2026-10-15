import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import OfficeWorld from "./game/OfficeWorld";
import { buildReport, reportToText } from "./game/report";
import { Company, PHASES, type Agent, type DeptStatus, type Snapshot } from "./game/sim";
import { BLOCK_NEED, CEO, DEPT_BRIEF, DEPT_LEAD, STAFF } from "./game/staff";
import { DEPT_ROOMS } from "./game/world";
import { LINK_ROWS } from "./links";
import { COMPANY, RECENT_OUTPUTS, STORAGE_LINK, TODAY_PICK } from "../company.config";

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
  const publishedRef = useRef(false);

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

  /** 오늘 브리핑을 텍스트로 만들어 클립보드에 복사한다 (카톡·노션 어디든 붙여넣기) */
  const sendReport = useCallback(
    async (auto: boolean) => {
      if (auto) {
        engine.pushLog("📋", "오늘 브리핑 정리 완료 — ‘📤 보고 복사’를 누르면 텍스트로 복사돼요", "mint");
        return;
      }
      try {
        await navigator.clipboard.writeText(reportToText(buildReport(engine.snapshot())));
        setCopied(true);
        engine.pushLog("📤", "오늘 브리핑을 클립보드에 복사했어요", "mint");
        showToast("브리핑 복사 완료 — 카톡·노션 어디든 붙여넣으세요");
      } catch {
        showToast("복사 실패 — 브라우저의 클립보드 권한을 확인해주세요");
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
    engine.start();
    setBriefing(false);
    setView("live");
    showToast(`07:00 — AI 직원 ${HEADCOUNT}명이 출근합니다 ✨`);
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
      {briefing ? <BriefingModal snap={snap} onClose={() => setBriefing(false)} /> : null}
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
}) {
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

      <section className="live-grid">
        <OfficeWorld engine={engine} snap={snap} selectedId={selectedId} follow={follow} onSelect={onSelect} />

        <aside className="live-rail">
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
                    <span className="mini-badge yellow">TOP 1 제안 · {TODAY_PICK.score}점</span>
                    <span className="score blink">결재 대기</span>
                  </div>
                  <h3>{TODAY_PICK.title}</h3>
                  <p>회의실에서 {APPROVERS}가 대표님을 기다리고 있어요.</p>
                  <div className="reason-list">
                    {TODAY_PICK.reasons.map((reason) => (
                      <span key={reason}>{reason}</span>
                    ))}
                  </div>
                  <button className="btn approve-button" onClick={onApprove}>
                    이 자료 세트 승인하기
                  </button>
                </>
              ) : (
                <>
                  <div className="approval-top">
                    <span className="mini-badge mint">{snap.approved ? "오늘 결재 완료" : "결재 대기 없음"}</span>
                  </div>
                  <h3>{snap.approved ? "승인하신 안으로 제작 중이에요" : "아직 올라온 안건이 없어요"}</h3>
                  <p>
                    {snap.approved
                      ? "분석지·단어장 → 워크북·변형·서술형 → 검수 → 상세페이지·홍보 → 등록 준비까지 이어집니다."
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

function BriefingModal({ snap, onClose }: { snap: Snapshot; onClose: () => void }) {
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
          <ul>
            <li>
              <span className="dot green" />
              완료 {snap.stats.done}팀 — 수요조사·기획·분석지·워크북·서술형·검수·상세페이지·홍보글까지 마쳤어요
            </li>
            <li>
              <span className="dot green" />
              대표 승인 1건 반영 — {TODAY_PICK.title} 제작 완료
            </li>
            <li>
              <span className="dot gray" />
              연동 대기 {snap.stats.blocked}팀 — 외부 서비스 연결이 필요해요
            </li>
          </ul>
          <div className="decision-box">
            <span className="tiny-label">오늘 대표님이 결정할 것</span>
            <strong>사이트 업로드와 카페·블로그 게시만 직접 해주세요. 내일 07:00에 다시 출근할게요 ✨</strong>
          </div>
          <button className="btn btn-primary" onClick={onClose}>
            확인
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
}: {
  teams: TeamRow[];
  filteredTeams: TeamRow[];
  filter: "전체" | DeptStatus;
  setFilter: (value: "전체" | DeptStatus) => void;
  snap: Snapshot;
  onStart: () => void;
  onApprove: () => void;
  onSelect: (id: string) => void;
}) {
  const rows = LINK_ROWS;

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
                  <span className="mini-badge yellow">TOP 1 제안</span>
                  <span className="score">{TODAY_PICK.score}점</span>
                </div>
                <h3>{TODAY_PICK.title}</h3>
                <p>{TODAY_PICK.summary}</p>
                <button
                  className={`btn approve-button ${snap.approved ? "approved" : ""}`}
                  onClick={onApprove}
                  disabled={!snap.approvalPending}
                >
                  {snap.approved ? "승인 완료 · 분석지팀 전달됨" : snap.approvalPending ? "이 자료 세트 승인하기" : "대기 중인 안건 없음"}
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
                      ? "TOP 1 자료 세트를 제작할지 승인해주세요."
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
              <span>결과물</span>
              <span>담당팀</span>
              <span>상태</span>
              <span>바로가기</span>
            </div>
            {RECENT_OUTPUTS.map((item) => (
              <div className="result-row" key={item.title}>
                <b>{item.title}</b>
                <span>{item.team}</span>
                <span className="status-pill done">{item.status}</span>
                <span>—</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <p className="dash-note">
        대표 {CEO.name}({CEO.callsign}) · AI 직원 {teams.length}개 부서 {HEADCOUNT}명 · 이 화면은 라이브 오피스와 같은 상태를
        공유해요.
      </p>
    </>
  );
}
