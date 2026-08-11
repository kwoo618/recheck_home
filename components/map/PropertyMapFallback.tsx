'use client';

import { formatDistanceLabel, SCHOOL_ORIGIN } from '@/lib/geo';
import { pinStyle } from './status-pin';
import type { MapProperty } from './types';

/**
 * 지도 폴백 리스트 (R4).
 *
 * 카카오맵 SDK가 뜨지 않아도 "어떤 매물이 어디에 있는지"는 알 수 있어야 한다.
 * 지도는 거리를 보여주는 여러 방법 중 하나일 뿐이고, 거리 자체는 서버에서 이미 계산돼 있다.
 *
 * 지도 영역만 이 리스트로 대체된다. 검증·비교·인쇄 흐름은 영향을 받지 않는다.
 */
export function PropertyMapFallback({
  properties,
  selectedId,
  onSelect,
  reason,
}: {
  properties: MapProperty[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  /** 사용자에게 보여줄 안내 문구 */
  reason: string;
}) {
  const located = properties.filter((p) => p.latitude !== null && p.longitude !== null);

  return (
    <div className="flex h-full flex-col gap-3 overflow-auto rounded-[14px] border border-[var(--rc-line)] bg-[var(--rc-surface)] p-4">
      <p className="text-[13px] text-[var(--rc-ink-soft)]">{reason}</p>

      <p className="text-[12.5px] text-[var(--rc-ink-faint)]">
        기준점: {SCHOOL_ORIGIN.name}
      </p>

      {located.length === 0 ? (
        <p className="text-[13px] text-[var(--rc-ink-faint)]">위치가 등록된 매물이 없습니다.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {located.map((p) => {
            const style = pinStyle(p.status);
            const selected = selectedId === p.id;

            return (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={onSelect ? () => onSelect(p.id) : undefined}
                  disabled={!onSelect}
                  aria-current={selected ? 'true' : undefined}
                  // 현장에서 쓰는 화면이므로 터치 타깃을 44px 이상으로 유지한다.
                  className={`flex min-h-11 w-full items-center gap-2 rounded-[10px] border bg-[var(--rc-surface)] px-3 py-2 text-left ${
                    selected ? 'border-[var(--rc-ink)]' : 'border-[var(--rc-line)]'
                  } ${onSelect ? 'cursor-pointer hover:border-[var(--rc-ink)]' : 'cursor-default'}`}
                >
                  <span
                    aria-hidden
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: style.color }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-semibold text-[var(--rc-ink)]">
                      {p.name}
                    </span>
                    <span className="block truncate text-[12px] text-[var(--rc-ink-soft)]">
                      {formatDistanceLabel(p.distanceFromSchool)}
                    </span>
                  </span>
                  {/* 색상만으로 상태를 구분하지 않는다 — 라벨을 반드시 병기 (PRD §1.3) */}
                  <span
                    className="shrink-0 rounded px-1.5 py-0.5 text-xs"
                    style={{ backgroundColor: style.color, color: style.textColor }}
                  >
                    {style.shortLabel}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
