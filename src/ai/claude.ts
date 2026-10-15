// Claude 페이지(아티팩트) 안에서만 쓸 수 있는 기능들에 대한 얇은 연결부.
// 로컬(npm run dev)이나 다른 곳에 올린 사본에는 window.claude 가 없어서 전부 null 이 된다.
// → 그때 사무실은 "연습 모드"(AI 없이 연출만)로 돈다.

export type SampleErrorCode =
  | "invalid_request"
  | "prompt_too_large"
  | "cancelled"
  | "not_granted"
  | "session_expired"
  | "sampling_disabled"
  | "not_declared"
  | "rate_limited"
  | "refused"
  | "empty_completion"
  | "invalid_json"
  | "upstream_error"
  | string;

export type SampleError = { code: SampleErrorCode; message: string; text?: string };

export type SampleOptions = {
  onText?: (update: { text: string; delta: string }) => void;
  signal?: AbortSignal;
  modelTier?: "default" | "complex" | "quick";
  cache?: boolean;
};

export type SampleFn = ((
  input: string,
  options?: SampleOptions,
) => Promise<{ text: string; truncated: boolean }>) & {
  json: <T = unknown>(input: string, options?: SampleOptions) => Promise<T>;
};

export type DocSnap = { id: string; exists: boolean; data(): Record<string, unknown> | undefined };
export type QuerySnap = { docs: DocSnap[] };
export type DocRef = {
  set(data: Record<string, unknown>): Promise<void>;
  update(data: Record<string, unknown>): Promise<void>;
  delete(): Promise<void>;
};
export type Query = {
  orderBy(field: string, dir?: "asc" | "desc"): Query;
  limit(n: number): Query;
  get(): Promise<QuerySnap>;
  onSnapshot(next: (snap: QuerySnap) => void, error?: (e: { code: string }) => void): () => void;
};
export type Collection = Query & { doc(id?: string): DocRef };
export type Db = { collection(path: string): Collection };

export type Downloads = {
  save(request: { filename: string; data: string | Blob }): Promise<{ status: "saved" | "delivered" }>;
};

export type Permissions = {
  request(names?: readonly string[]): Promise<Record<string, string>>;
};

type ClaudeBridge = { use(name: string): Promise<unknown> };

function bridge(): ClaudeBridge | null {
  const w = window as unknown as { claude?: ClaudeBridge };
  return w.claude && typeof w.claude.use === "function" ? w.claude : null;
}

async function use<T>(name: string): Promise<T | null> {
  const claude = bridge();
  if (!claude) return null;
  try {
    return ((await claude.use(name)) as T | null) ?? null;
  } catch {
    return null;
  }
}

/** Claude 페이지 안에서 열렸는지 (로컬·다른 곳 사본이면 false) */
export const inClaude = () => bridge() !== null;

export const getSample = () => use<SampleFn>("sample");
export const getDb = () => use<Db>("db");
export const getDownloads = () => use<Downloads>("downloads");
export const getPermissions = () => use<Permissions>("permissions");

/** 실패 코드 → 대표님께 보여줄 문장 */
export function sampleErrorText(code: string): string {
  switch (code) {
    case "not_granted":
      return "AI 사용 허락이 꺼져 있어요. 페이지의 권한 메뉴에서 켜주세요.";
    case "sampling_disabled":
      return "이 계정에서는 AI 작업을 쓸 수 없어요.";
    case "rate_limited":
      return "AI 사용량이 잠깐 몰렸어요. 조금 뒤에 '다시 만들기'를 눌러주세요.";
    case "session_expired":
      return "로그인이 만료됐어요. 다시 로그인한 뒤 '다시 만들기'를 눌러주세요.";
    case "refused":
      return "AI가 이 요청을 거절했어요. 지문을 확인하고 다시 시도해주세요.";
    case "prompt_too_large":
      return "지문이 너무 길어요. 지문 하나씩 나눠서 넣어주세요.";
    case "invalid_json":
      return "답을 읽지 못했어요. '다시 만들기'를 눌러주세요.";
    case "cancelled":
      return "작업을 멈췄어요.";
    default:
      return "AI 연결이 잠깐 끊겼어요. '다시 만들기'를 눌러주세요.";
  }
}

// ── 커넥터(mcp) — 제작실이 Claude Code 세션을 열고 지켜보는 데 쓴다 ──
export type McpError = { code: string; message?: string; retryable?: boolean; result?: unknown };
export type McpResult = { payload?: unknown; cache?: { storedAt: number; revalidating: boolean } };
export type McpWatchEvent = { type: "data"; result: McpResult } | { type: "error"; error: McpError };
export type Mcp = {
  callTool(server: string, tool: string, input?: unknown, options?: { cache?: false }): Promise<McpResult>;
  watchTool(
    server: string,
    tool: string,
    input: unknown,
    handler: (ev: McpWatchEvent) => void,
    options?: { cache?: { staleTime?: number; gcTime?: number }; refetchInterval?: number },
  ): () => void;
  invalidate(server?: string, tool?: string, input?: unknown): Promise<void>;
  listTools(server?: string): Promise<{ servers: { server: string; authStatus: string; tools: { name: string }[] }[] }>;
};

export const getMcp = () => use<Mcp>("mcp");

/** 커넥터 실패 코드 → 대표님께 보여줄 문장 */
export function mcpErrorText(e: unknown, server: string): string {
  const err = (e ?? {}) as McpError;
  switch (err.code) {
    case "needs_reauth":
      return `${server} 연결이 만료됐어요. claude.ai 설정 → 커넥터에서 다시 연결해 주세요.`;
    case "server_not_connected":
    case "server_not_found":
      return `${server} 커넥터가 없어요. claude.ai 설정 → 커넥터에서 추가해 주세요.`;
    case "selection_required":
      return `${server} 커넥터가 여러 개예요. 화면에 뜬 선택 창에서 하나를 골라 주세요.`;
    case "not_in_manifest":
    case "approval_required":
    case "not_granted":
      return `이 페이지에 ${server} 사용을 허락하지 않았어요. 페이지의 권한 메뉴에서 켜 주세요.`;
    case "blocked_by_policy":
      return `조직 정책으로 ${server}를 쓸 수 없어요.`;
    case "capability_disabled":
    case "capability_removed":
      return "이 화면에서는 커넥터를 쓸 수 없어요. claude.ai에서 페이지를 다시 열어 주세요.";
    case "server_unavailable":
      return `${server}가 잠깐 응답하지 않아요. 조금 뒤 새로고침해 주세요.`;
    case "tool_error":
      return `${server}가 거절했어요: ${String(err.message ?? "").slice(0, 300)}`;
    default:
      return `${server} 연결 중 문제가 생겼어요 (${err.code ?? "알 수 없음"}).`;
  }
}
