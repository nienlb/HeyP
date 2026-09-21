"use client";

import {
  ORDER_TYPES,
  ORDER_TYPE_LABELS,
  STATUS_LABELS,
} from "@/lib/order-status";
import {
  DATE_PRESETS,
  DATE_PRESET_LABELS,
  DUE_LABELS,
  FILTER_STATUSES,
  type FilterGroup,
  type OrderFilters,
} from "@/lib/order-filters";

export const GROUP_TITLES: Record<FilterGroup, string> = {
  date: "Ngày tạo",
  status: "Trạng thái",
  type: "Loại đơn",
  due: "Còn thu",
};

/** Một nhóm lọc. Dùng chung cho Sheet (điện thoại) và bảng nổi ▾ (desktop). */
export function FilterFields({
  group,
  value,
  onChange,
}: {
  group: FilterGroup;
  value: OrderFilters;
  onChange: (f: OrderFilters) => void;
}) {
  if (group === "date") {
    const range = value.date && !("preset" in value.date) ? value.date : null;
    return (
      <div className="flt-group">
        <div className="chip-row">
          {DATE_PRESETS.map((p) => {
            const on =
              value.date !== null &&
              "preset" in value.date &&
              value.date.preset === p;
            return (
              <button
                key={p}
                type="button"
                className={`chip${on ? " chip-on" : ""}`}
                onClick={() =>
                  onChange({ ...value, date: on ? null : { preset: p } })
                }
              >
                {DATE_PRESET_LABELS[p]}
              </button>
            );
          })}
        </div>
        <div className="flt-range">
          <label className="field">
            <span>Từ ngày</span>
            <input
              type="date"
              value={range?.from ?? ""}
              onChange={(e) =>
                onChange({
                  ...value,
                  date: e.target.value
                    ? { from: e.target.value, to: range?.to ?? e.target.value }
                    : null,
                })
              }
            />
          </label>
          <label className="field">
            <span>Đến ngày</span>
            <input
              type="date"
              value={range?.to ?? ""}
              onChange={(e) =>
                onChange({
                  ...value,
                  date: e.target.value
                    ? { from: range?.from ?? e.target.value, to: e.target.value }
                    : null,
                })
              }
            />
          </label>
        </div>
      </div>
    );
  }

  if (group === "status" || group === "type") {
    const options: readonly string[] =
      group === "status" ? FILTER_STATUSES : ORDER_TYPES;
    const picked: readonly string[] =
      group === "status" ? value.statuses : value.types;
    const label = (k: string) =>
      group === "status"
        ? STATUS_LABELS[k as keyof typeof STATUS_LABELS]
        : ORDER_TYPE_LABELS[k as keyof typeof ORDER_TYPE_LABELS];
    function toggle(k: string) {
      const next = picked.includes(k)
        ? picked.filter((v) => v !== k)
        : [...picked, k];
      onChange(
        group === "status"
          ? { ...value, statuses: next as OrderFilters["statuses"] }
          : { ...value, types: next as OrderFilters["types"] },
      );
    }
    return (
      <div className="flt-group">
        {options.map((k) => (
          <label key={k} className="flt-check">
            <input
              type="checkbox"
              checked={picked.includes(k)}
              onChange={() => toggle(k)}
            />
            {label(k)}
          </label>
        ))}
      </div>
    );
  }

  return (
    <div className="flt-group">
      {(["paid", "owing"] as const).map((k) => (
        <label key={k} className="flt-check">
          <input
            type="radio"
            name="flt-due"
            checked={value.due === k}
            onChange={() => onChange({ ...value, due: k })}
          />
          {DUE_LABELS[k]}
        </label>
      ))}
    </div>
  );
}
