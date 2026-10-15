// 라이브 오피스의 하루 결과 → 일일 브리핑으로 변환한다
import type { Snapshot } from "./sim";
import { BLOCK_NEED, DEPT_BRIEF } from "./staff";
import { roomOf } from "./world";
import { COMPANY, TODAY_PICK } from "../../company.config";

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

export function buildReport(snap: Snapshot): DayReport {
  const entries = Object.entries(snap.deptStatus);

  const highlights = entries
    .filter(([, status]) => status === "완료")
    .map(([dept]) => `${roomOf(dept).name} — ${DEPT_BRIEF[dept]?.report ?? "완료"}`);

  const risks = entries
    .filter(([, status]) => status === "연동 대기")
    .map(([dept]) => `${roomOf(dept).name} — ${BLOCK_NEED[dept] ?? "외부 연동"} 대기로 오늘 진행 불가`);

  const decisions = snap.approved
    ? [`TOP 1 '${TODAY_PICK.title}' 제작 승인 — 분석지·단어장·워크북·변형·서술형 제작 진행`]
    : snap.approvalPending
      ? [`TOP 1 '${TODAY_PICK.title}' 승인 여부 (결재 대기 중)`]
      : ["오늘 대표 결재 안건 없음"];

  const next = [
    ...risks.map((risk) => `${risk.split(" — ")[0]}: 연동 완료되면 즉시 재가동`),
    ...(snap.approved
      ? ["사이트·관리자페이지에 자료 업로드 (대표 확인)", "황영카·기출비 카페 + 블로그 홍보글 게시 (대표 직접)"]
      : ["TOP 3 재검토"]),
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

/** 카톡·노션·메모장 어디든 붙여넣을 수 있는 텍스트 브리핑 */
export function reportToText(report: DayReport): string {
  const section = (title: string, items: string[]) =>
    [`■ ${title}`, ...(items.length ? items.map((item) => `- ${item}`) : ["- 없음"])].join("\n");
  const { counts } = report;
  return [
    `📋 ${report.title}`,
    `${report.clock} 기준 · ${report.phase}`,
    `완료 ${counts.done} · 진행 ${counts.working} · 승인 대기 ${counts.approval} · 연동 대기 ${counts.blocked} (전체 ${counts.total}팀)`,
    "",
    section("핵심 성과", report.highlights),
    "",
    section("대표 결정사항", report.decisions),
    "",
    section("문제·위험", report.risks),
    "",
    section("다음 우선순위", report.next),
    "",
    section("오늘 진행 로그", report.log.map((entry) => `${entry.time} ${entry.text}`)),
  ].join("\n");
}
