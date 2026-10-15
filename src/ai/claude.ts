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
