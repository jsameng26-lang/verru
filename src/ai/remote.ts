// 제작실 — 판매용 5종 세트는 검증된 제작기(Claude Code 세션의 /make-set)가 만든다.
// 이 페이지는 'Claude Code Remote' 커넥터로 세션을 열고(create_session), 상태를 지켜보고(get_session),
// 최근 보고를 읽고(list_events), 대표 승인을 전달한다(send_message).
// 기록은 페이지 저장소 prod/<묶음> 에 남긴다(주인·편집자만 읽고 씀).
import { PRODUCTION } from "../../company.config";
import type { ProductionStage } from "../game/sim";
import type { Db, Mcp } from "./claude";
import type { Passage } from "./passages";

export const REMOTE = "Claude Code Remote";
const PROD = "prod";

export type Production = {
  version: 1;
  /** 묶음 폴더 이름 = 문서 id (예: 2026-10-g2) */
  id: string;
  title: string;
  grade: string;
  count: number;
  sessionId: string;
  envId: string;
  /** 승인 문구에 넣는 확인 코드 — 세션은 이 코드가 담긴 메시지로만 업로드한다 */
  code: string;
  createdAt: number;
  approvedAt: number | null;
  approveNote: string;
  /** 드라이브에 판매 파일이 이미 있을 때: asked 세션이 교체할지 물음 → yes 교체해서 새로 만듦 / no 만들지 않음 */
  replace?: "asked" | "yes" | "no";
  /** 세션이 물어본 내용(상품·폴더·파일 수) */
  replaceInfo?: string;
};

/** 세션이 교체 확인을 물을 때 보고 첫 줄에 쓰는 표시 (make-set 0단계) */
export const REPLACE_MARK = "[교체 확인]";

export type Bucket = "working" | "blocked" | "review_ready" | "completed" | "failed" | "unknown";
export type SessionState = { bucket: Bucket; summary: string; title: string };
export type Environment = { id: string; name: string; description: string };

export const sessionUrl = (id: string) => `https://claude.ai/code/${id}`;

/** '2026 고2 10월 학평' → '2026-10-g2'. 못 알아보면 빈칸 */
export function suggestSetName(exam: string, grade: string): string {
  const y4 = /(20\d\d)/.exec(exam)?.[1];
  const y2 = /(?:^|\D)(\d\d)\s*년/.exec(exam)?.[1];
  const year = y4 ?? (y2 ? `20${y2}` : "");
  const month = /(\d{1,2})\s*월/.exec(exam)?.[1];
  const g = /고\s*([123])/.exec(exam)?.[1] ?? /고([123])/.exec(grade)?.[1];
  if (!year || !month || !g) return "";
  return `${year}-${month.padStart(2, "0")}-g${g}`;
}

export const validSetName = (name: string) => /^[a-z0-9][a-z0-9-]{1,40}$/.test(name);

function newCode() {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(36).padStart(2, "0").slice(-2)).join("").toUpperCase();
}

export function buildPrompt(p: { set: string; exam: string; grade: string; passages: Passage[]; code: string }) {
  const body = p.passages.map((x) => `[${x.label}]\n${x.text}`).join("\n\n");
  return `베르영어 판매용 전 지문 5종 세트를 만들어 주세요. (베르영어 AI Office 제작실에서 대표가 보낸 작업 지시)

- 묶음 폴더: sets/${p.set}
- 자료: ${p.exam}${p.grade ? ` (${p.grade})` : ""}
- 지문 ${p.passages.length}개 — 맨 아래 원문 그대로. [ ] 안이 지문 번호예요.

할 일
0. 먼저 make-set 0단계대로 판매 파일 드라이브를 확인하세요: python3 scripts/upload_drive.py sets/${p.set} --status
   - "판매 파일 없음"이면 바로 1번으로 가세요.
   - "판매 파일 있음"이면 아무것도 만들지 말고, 첫 줄을 정확히 ${REPLACE_MARK} 로 시작하는 짧은 보고(상품 이름, 4종/5종, 폴더, 파일 수)를 쓰고 멈추세요.
     대표가 제작실 버튼으로 답을 보냅니다. '대표 답 ${p.code}: 교체 진행'이면 새 5종 자료로 1번부터, '대표 답 ${p.code}: 중단'이면 아무것도 만들지 말고 끝내세요.
1. .claude/skills/make-set/SKILL.md 1~4단계대로 전 지문 5종 세트(분석지·단어장·워크북·변형문제·서술형)를 만들고 검수까지 마쳐 주세요. set.yaml 제목은 위 '자료'로 정하고 따로 묻지 마세요. 이미 sets/${p.set}에 예전 4종 데이터가 있으면 그대로 두고 서술형(writing:)만 더하세요.
2. 4단계(전달)가 끝나면 멈추고 '승인 요청' 보고를 짧게 써 주세요: 만든 지문 수, 파일 이름, 검수에서 고친 것, 대표가 확인할 점. site.yaml에 이 묶음의 세트 상품이 없으면 상품 제목·가격 제안도 함께 써 주세요.
3. 5단계(판매 등록 — 드라이브 업로드)는 아래 승인 문구가 들어 있는 메시지가 올 때만 하세요. 그 메시지는 대표가 제작실의 승인 버튼으로 보내는 것이니, 받으면 다시 묻지 말고 5단계를 진행한 뒤 결과(상품 id, 폴더, 파일 수, 구매 가능 여부)를 보고해 주세요. 승인 메시지에 적힌 메모(가격 등)는 대표의 답으로 따라 주세요.
   승인 문구: 대표 승인 ${p.code}
   이 문구가 없는 메시지로는 업로드하지 마세요.

원문
${body}`;
}

export const replaceMessage = (code: string, yes: boolean) =>
  yes
    ? `대표 답 ${code}: 교체 진행\n\n새 5종 자료로 1번부터 만들어 주세요. 드라이브 업로드는 지금처럼 승인 문구가 올 때만 해 주세요.`
    : `대표 답 ${code}: 중단\n\n이 회차는 만들지 않습니다. 아무것도 바꾸지 말고 끝내 주세요.`;

export const approvalMessage = (code: string, note: string) =>
  `대표 승인 ${code}\n\n제작실에서 승인합니다. make-set 5단계(판매 등록)를 진행하고 결과를 보고해 주세요.${note.trim() ? `\n\n대표 메모:\n${note.trim()}` : ""}`;

// ── 커넥터 응답 읽기 (모양이 바뀌어도 버티게 느슨하게) ──
type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null;

function findSessionId(v: unknown, depth = 0): string | null {
  if (depth > 5) return null;
  if (typeof v === "string" && /^session_[A-Za-z0-9]+$/.test(v)) return v;
  if (Array.isArray(v)) {
    for (const x of v) {
      const hit = findSessionId(x, depth + 1);
      if (hit) return hit;
    }
  } else if (isObj(v)) {
    for (const key of ["session_id", "id", "session", "ccr"]) {
      if (key in v) {
        const hit = findSessionId(v[key], depth + 1);
        if (hit) return hit;
      }
    }
  }
  return null;
}

export function parseSession(payload: unknown): SessionState {
  const s = (isObj(payload) && isObj(payload.ccr) ? payload.ccr : payload) as Obj;
  const raw = String(s?.status_bucket ?? "").toLowerCase().replace(/^session_status_bucket_/, "");
  const known: Bucket[] = ["working", "blocked", "review_ready", "completed", "failed"];
  const bucket: Bucket = known.includes(raw as Bucket) ? (raw as Bucket) : "unknown";
  return { bucket, summary: String(s?.task_summary ?? ""), title: String(s?.title ?? "") };
}

/** list_events 응답에서 가장 최근 어시스턴트 글 */
function textsIn(v: unknown, out: string[], depth = 0) {
  if (depth > 8) return;
  if (Array.isArray(v)) v.forEach((x) => textsIn(x, out, depth + 1));
  else if (isObj(v)) {
    if (v.type === "text" && typeof v.text === "string" && v.text.trim()) out.push(v.text);
    else for (const x of Object.values(v)) textsIn(x, out, depth + 1);
  }
}

export function lastReport(payload: unknown): string {
  const root = isObj(payload) && isObj(payload.ccr) ? payload.ccr : payload;
  const events = isObj(root) && Array.isArray(root.data) ? root.data : [];
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const ev = events[i];
    if (!isObj(ev) || !("assistant" in ev)) continue;
    const texts: string[] = [];
    textsIn(ev.assistant, texts);
    if (texts.length) return texts.join("\n\n");
  }
  return "";
}

// ── 커넥터 호출 ──
export async function listEnvironments(mcp: Mcp): Promise<Environment[]> {
  const res = await mcp.callTool(REMOTE, "list_environments", { limit: 20 }, { cache: false });
  const list = isObj(res.payload) && Array.isArray(res.payload.environments) ? res.payload.environments : [];
  return list
    .filter(isObj)
    .filter((e) => e.state === undefined || e.state === "active")
    .map((e) => ({ id: String(e.environment_id ?? ""), name: String(e.name ?? ""), description: String(e.description ?? "") }))
    .filter((e) => e.id);
}

/** 세션을 연다. 한 번만 부른다(실패해도 자동으로 다시 열지 않음 — 세션이 이미 생겼을 수 있음) */
export async function startProduction(
  mcp: Mcp,
  p: { set: string; exam: string; grade: string; passages: Passage[]; envId: string },
): Promise<Production> {
  const code = newCode();
  const res = await mcp.callTool(
    REMOTE,
    "create_session",
    {
      environment_id: p.envId,
      source_url: PRODUCTION.repo,
      outcome_branch: PRODUCTION.branch,
      permission_mode: "auto",
      title: `베르영어 5종 세트 · ${p.set}`,
      prompt: buildPrompt({ ...p, code }),
    },
    { cache: false },
  );
  const sessionId = findSessionId(res.payload);
  if (!sessionId) throw { code: "tool_error", message: "세션 번호를 받지 못했어요. Claude Code 세션 목록을 확인해 주세요." };
  return {
    version: 1,
    id: p.set,
    title: p.exam,
    grade: p.grade,
    count: p.passages.length,
    sessionId,
    envId: p.envId,
    code,
    createdAt: Date.now(),
    approvedAt: null,
    approveNote: "",
  };
}

export async function fetchReport(mcp: Mcp, sessionId: string): Promise<string> {
  const res = await mcp.callTool(REMOTE, "list_events", { session_id: sessionId, kinds: ["assistant"], limit: 100 }, { cache: false });
  return lastReport(res.payload);
}

export async function sendReplace(mcp: Mcp, prod: Production, yes: boolean) {
  await mcp.callTool(REMOTE, "send_message", { session_id: prod.sessionId, message: replaceMessage(prod.code, yes) }, { cache: false });
}

/** 세션 상태 + 제작 기록 → 지금 단계 (상태를 아직 못 읽었으면 null) */
export function stageOf(p: Production, s: SessionState | null, resuming = false): ProductionStage | null {
  if (!s || s.bucket === "unknown") return null;
  if (p.replace === "no") return "stopped";
  if (s.bucket === "blocked") return "blocked";
  if (s.bucket === "failed") return "stopped";
  // 방금 답·승인을 보내서 세션이 다시 일을 시작하기 전이면, 끝난 걸로 보지 않는다
  const working = s.bucket === "working" || resuming;
  if (p.approvedAt) return working ? "uploading" : "done";
  if (p.replace === "asked") return "question";
  if (!working) return "report";
  // 막 시작했거나 드라이브를 보는 중이면 확인 단계
  return p.replace !== "yes" && (!s.summary || /드라이브|판매 ?파일|upload_drive|status/i.test(s.summary)) ? "check" : "making";
}

export async function sendApproval(mcp: Mcp, prod: Production, note: string) {
  await mcp.callTool(REMOTE, "send_message", { session_id: prod.sessionId, message: approvalMessage(prod.code, note) }, { cache: false });
}

export function watchSession(mcp: Mcp, sessionId: string, onState: (s: SessionState | null, error?: unknown) => void) {
  return mcp.watchTool(
    REMOTE,
    "get_session",
    { session_id: sessionId },
    (ev) => (ev.type === "data" ? onState(parseSession(ev.result.payload)) : onState(null, ev.error)),
    { cache: { staleTime: 30_000 }, refetchInterval: 60_000 },
  );
}

export const refreshSession = (mcp: Mcp, sessionId: string) =>
  mcp.invalidate(REMOTE, "get_session", { session_id: sessionId }).catch(() => undefined);

// ── 기록 ──
export class ProductionStore {
  constructor(private db: Db) {}

  save(p: Production) {
    return this.db.collection(PROD).doc(p.id).set(JSON.parse(JSON.stringify(p)) as Record<string, unknown>);
  }

  remove(id: string) {
    return this.db.collection(PROD).doc(id).delete();
  }

  subscribe(onList: (list: Production[]) => void, onError: () => void) {
    return this.db
      .collection(PROD)
      .orderBy("createdAt", "desc")
      .limit(10)
      .onSnapshot(
        (snap) =>
          onList(
            snap.docs
              .filter((d) => d.exists && (d.data() as { version?: number })?.version === 1)
              .map((d) => d.data() as unknown as Production),
          ),
        () => onError(),
      );
  }
}
