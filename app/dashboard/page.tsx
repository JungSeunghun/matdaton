"use client";

import { useEffect, useMemo, useState } from "react";
import StatusBadge from "../components/status-badge";
import { getDailyMetrics } from "../lib/api";
import type { DailyMetric } from "../lib/types";

const CHART_W = 560;
const CHART_H = 200;
const PAD = { top: 16, right: 8, bottom: 28, left: 8 };
const MAX_SEC = 120;

export default function DashboardPage() {
  const [metrics, setMetrics] = useState<DailyMetric[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    getDailyMetrics().then(setMetrics).catch(() => setError(true));
  }, []);

  const stats = useMemo(() => {
    if (!metrics) return null;
    const valid = metrics.filter((m): m is DailyMetric & { startupSeconds: number } => m.startupSeconds != null);
    if (valid.length === 0) return null;
    const secs = valid.map((m) => m.startupSeconds).sort((a, b) => a - b);
    const mid = Math.floor(secs.length / 2);
    const median = secs.length % 2 ? secs[mid] : Math.round((secs[mid - 1] + secs[mid]) / 2);
    const totalSaved = Math.round(valid.reduce((n, m) => n + (m.savedMinutes ?? 0), 0));
    const rates = valid.map((m) => m.evidenceLinkRate).filter((r): r is number => r != null);
    const linkRate = rates.length > 0 ? rates.reduce((n, r) => n + r, 0) / rates.length : null;
    return { median, totalSaved, linkRate, samples: valid.length, from: valid[0].date, to: valid[valid.length - 1].date, valid };
  }, [metrics]);

  const chart = useMemo(() => {
    const valid = stats?.valid;
    if (!valid || valid.length === 0) return null;
    const innerW = CHART_W - PAD.left - PAD.right;
    const innerH = CHART_H - PAD.top - PAD.bottom;
    const slot = innerW / valid.length;
    const barW = Math.min(32, slot * 0.55);
    const y = (sec: number) => PAD.top + innerH * (1 - Math.min(sec, MAX_SEC) / MAX_SEC);

    let cum = 0;
    const maxCum = valid.reduce((n, m) => n + (m.savedMinutes ?? 0), 0) || 1;
    const line = valid
      .map((m, i) => {
        cum += m.savedMinutes ?? 0;
        const px = PAD.left + slot * i + slot / 2;
        const py = PAD.top + innerH * (1 - cum / maxCum);
        return `${i === 0 ? "M" : "L"}${px.toFixed(1)},${py.toFixed(1)}`;
      })
      .join(" ");

    return { slot, barW, y, line, innerH };
  }, [stats]);

  return (
    <main className="page">
      <section className="section" aria-labelledby="dash-title">
        <p className="caption-upper">METRICS</p>
        <h1 className="page-title" id="dash-title">누적 대시보드</h1>
        <p className="page-lead">
          일별 시동 시간(button_clicked → approval_completed)과 절약 시간의 자동 측정 결과입니다. 계산식과 원본
          이벤트는 저장소에 포함됩니다.
        </p>

        {error && (
          <div className="error-banner" role="alert">
            <StatusBadge tone="error" label="실패" /> 메트릭을 불러오지 못했습니다.
          </div>
        )}

        {stats && metrics && chart && (
          <>
            {stats.samples < 10 && <StatusBadge tone="warning" label={`데이터 수집 중 · 표본 ${stats.samples}회 (10회 미만)`} />}

            <div className="stats-grid">
              <div className="stat-card">
                <p className="stat-label">시동 시간 중앙값</p>
                <p className="stat-value">{stats.median}초</p>
              </div>
              <div className="stat-card">
                <p className="stat-label">누적 절약</p>
                <p className="stat-value success-text">{stats.totalSaved}분</p>
              </div>
              <div className="stat-card">
                <p className="stat-label">표본 수</p>
                <p className="stat-value">{stats.samples}회</p>
              </div>
              <div className="stat-card">
                <p className="stat-label">근거 연결률</p>
                <p className="stat-value">{stats.linkRate != null ? `${Math.round(stats.linkRate * 100)}%` : "—"}</p>
              </div>
            </div>

            <div className="chart-card">
              <div className="chart-head">
                <p className="chart-title">일별 시동 시간 · 절약 누적</p>
                <p className="chart-meta">
                  관찰 기간 {stats.from} ~ {stats.to} · 목표 90초
                </p>
              </div>
              <svg
                viewBox={`0 0 ${CHART_W} ${CHART_H}`}
                className="chart"
                role="img"
                aria-label={`일별 시동 시간 막대 차트, 중앙값 ${stats.median}초`}
              >
                {/* 90초 목표선 */}
                <line
                  x1={PAD.left}
                  x2={CHART_W - PAD.right}
                  y1={chart.y(90)}
                  y2={chart.y(90)}
                  className="chart-target"
                />
                <text x={CHART_W - PAD.right} y={chart.y(90) - 5} textAnchor="end" className="chart-target-label">
                  90초
                </text>
                {stats.valid.map((m, i) => {
                  const x = PAD.left + chart.slot * i + (chart.slot - chart.barW) / 2;
                  const barY = chart.y(m.startupSeconds);
                  return (
                    <g key={m.date}>
                      <rect
                        x={x}
                        y={barY}
                        width={chart.barW}
                        height={CHART_H - PAD.bottom - barY}
                        className={m.startupSeconds <= 90 ? "chart-bar" : "chart-bar over"}
                        rx="3"
                      />
                      <text
                        x={x + chart.barW / 2}
                        y={CHART_H - PAD.bottom + 16}
                        textAnchor="middle"
                        className="chart-x-label"
                      >
                        {m.date.slice(5)}
                      </text>
                      <text x={x + chart.barW / 2} y={barY - 5} textAnchor="middle" className="chart-bar-label">
                        {m.startupSeconds}
                      </text>
                    </g>
                  );
                })}
                <path d={chart.line} className="chart-saved-line" fill="none" />
              </svg>
              <div className="chart-legend">
                <span>
                  <i className="legend-swatch ink" aria-hidden /> 시동 시간(초)
                </span>
                <span>
                  <i className="legend-swatch success" aria-hidden /> 절약 누적(상대)
                </span>
                <span>
                  <i className="legend-swatch dashed" aria-hidden /> 90초 목표
                </span>
              </div>
            </div>

            <p className="formula-note">
              계산식: 시동 시간 = approval_completed − button_clicked · 절약 = 수동 기준값(30분) − 시동 시간 ·
              근거 연결률 = 근거 링크가 있는 행동 / 전체 행동
            </p>
          </>
        )}
      </section>
    </main>
  );
}
