// 라이브 오피스의 하루 결과 → 보고서로 변환한다 (발행은 아래 연동 자리에서)
import type { Snapshot } from "./sim";
import { BLOCK_NEED, DEPT_BRIEF } from "./staff";
import { roomOf } from "./world";
import { COMPANY } from "../../company.config";

export type DayReport = {
  title: string;
  clock: string;
  phase: string;
  counts: { total: number; done: number; working: number; approval: number; blocked: number };
  highlights: string[];
  decisions: string[];
  risks: string[];
  next: string[];
  log: { time: string; text: string }[];
};

export type PublishResult = {
  notion: { ok: boolean; status: string; detail?: string; url?: string };
  discord: { ok: boolean; status: string; detail?: string };
  publishedAt: string;
};

export type IntegrationStatus = Record<
  string,
  { configured: boolean; label: string; need?: string }
>;

export function buildReport(snap: Snapshot): DayReport {
  const entries = Object.entries(snap.deptStatus);

  const highlights = entries
    .filter(([, status]) => status === "완료")
    .map(([dept]) => `${roomOf(dept).name} — ${DEPT_BRIEF[dept]?.report ?? "완료"}`);

  const risks = entries
    .filter(([, status]) => status === "연동 대기")
    .map(([dept]) => `${roomOf(dept).name} — ${BLOCK_NEED[dept] ?? "외부 연동"} 대기로 오늘 진행 불가`);

  const decisions = snap.approved
    ? ["TOP 1 콘텐츠 제작 승인 — 대본·제작까지 진행 완료"]
    : snap.approvalPending
      ? ["TOP 1 콘텐츠 승인 여부 (결재 대기 중)"]
      : ["오늘 대표 결재 안건 없음"];

  const next = [
    ...risks.map((risk) => `${risk.split(" — ")[0]}: 연동 완료되면 즉시 재가동`),
    snap.approved ? "제작된 콘텐츠 업로드 및 성과 기록" : "TOP 3 재검토",
  ];

  return {
    title: `${snap.clock} ${COMPANY.reportName} 일일 브리핑`,
    clock: snap.clock,
    phase: snap.phase,
    counts: {
      total: entries.length,
      done: snap.stats.done,
      working: snap.stats.working,
      approval: snap.stats.approval,
      blocked: snap.stats.blocked,
    },
    highlights,
    decisions,
    risks,
    next,
    log: [...snap.log].reverse().map((entry) => ({ time: entry.time, text: `${entry.icon} ${entry.text}` })),
  };
}

// ── 연동 자리 (껍데기) ──────────────────────────────────────
// 이 버전은 서버 없이 브라우저만으로 돌아갑니다.
// 그래서 Notion·Discord 등은 전부 "미설정"으로 표시되고, 보고 발행은 실제로 아무 데도 보내지 않아요.
// 나중에 진짜 연동을 붙일 땐 아래 두 함수만 서버 호출로 바꾸면 됩니다.
// (예: fetch("/api/report", { method: "POST", body: JSON.stringify(report) }))

export async function publish(report: DayReport): Promise<PublishResult> {
  void report;
  return {
    notion: { ok: false, status: "unconfigured", detail: "미설정 (껍데기 버전)" },
    discord: { ok: false, status: "unconfigured", detail: "미설정 (껍데기 버전)" },
    publishedAt: new Date().toISOString(),
  };
}

export async function fetchIntegrations(): Promise<IntegrationStatus> {
  return {
    notion: { configured: false, label: "Notion 저장" },
    discord: { configured: false, label: "Discord 전송" },
    instagram: { configured: false, label: "Instagram 지표", need: "연동 대기" },
    gmail: { configured: false, label: "Gmail 읽기", need: "연동 대기" },
    finance: { configured: false, label: "재무 파일", need: "자료 대기" },
  };
}
