import { requireAdmin } from "@/lib/auth";
import { ChipBar, Chip } from "@/app/_components/chip";
import { listActivity, listActivityActors } from "@/db/activity";
import { ACTIVITY_ENTITIES, actionLabel } from "@/lib/activity-codes";
import { formatDateTime } from "@/lib/format";
import type { SortDir } from "@/lib/table-sort";
import { ActivityList, type ActivityItem } from "./activity-list";

const GIOI_HAN = 200;

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<{
    actor?: string;
    entity?: string;
    sort?: string;
    dir?: string;
  }>;
}) {
  const [, { actor, entity, sort, dir: rawDir }, actors] = await Promise.all([
    // Admin trở lên — Owner tự động qua nhờ thang bậc.
    requireAdmin(),
    searchParams,
    listActivityActors(),
  ]);

  const entityHopLe = (ACTIVITY_ENTITIES as readonly string[]).includes(
    entity ?? "",
  )
    ? entity
    : undefined;
  const actorHopLe = actor && actors.includes(actor) ? actor : undefined;
  const dir: SortDir = rawDir === "asc" ? "asc" : "desc";

  const rows = await listActivity({
    limit: GIOI_HAN,
    actor: actorHopLe,
    entity: entityHopLe,
  });

  const items: ActivityItem[] = rows.map((r) => ({
    id: r.id,
    actor: r.actor,
    actionText: actionLabel(r.action),
    entity: r.entity,
    entityId: r.entityId,
    // Link chéo sang bản chụp khi đây là dòng xoá đơn/khách.
    snapshotHref: r.action.endsWith(".delete") ? "/admin/deletions" : null,
    detailText: r.detail ?? "—",
    createdAt: r.createdAt,
    timeText: formatDateTime(r.createdAt),
  }));

  const chipHref = (k: "actor" | "entity", v: string | null) => {
    const p = new URLSearchParams();
    const a = k === "actor" ? v : (actorHopLe ?? null);
    const e = k === "entity" ? v : (entityHopLe ?? null);
    if (a) p.set("actor", a);
    if (e) p.set("entity", e);
    const qs = p.toString();
    return qs ? `/admin/activity?${qs}` : "/admin/activity";
  };

  // Gửi dạng CHUỖI, không phải hàm: ActivityList là client component.
  const sortBase = (() => {
    const p = new URLSearchParams();
    if (actorHopLe) p.set("actor", actorHopLe);
    if (entityHopLe) p.set("entity", entityHopLe);
    return p.toString();
  })();

  return (
    <>
      <ChipBar>
        <Chip
          href={chipHref("actor", null)}
          label="Mọi người"
          active={!actorHopLe}
        />
        {actors.map((a) => (
          <Chip
            key={a}
            href={chipHref("actor", a)}
            label={a}
            active={actorHopLe === a}
          />
        ))}
      </ChipBar>

      <ChipBar>
        <Chip
          href={chipHref("entity", null)}
          label="Mọi loại"
          active={!entityHopLe}
        />
        {ACTIVITY_ENTITIES.map((e) => (
          <Chip
            key={e}
            href={chipHref("entity", e)}
            label={e}
            active={entityHopLe === e}
          />
        ))}
      </ChipBar>

      {items.length === 0 ? (
        <div className="card empty">
          <p>Chưa có hoạt động nào khớp bộ lọc.</p>
        </div>
      ) : (
        <>
          <ActivityList
            items={items}
            sort={sort}
            dir={dir}
            sortBase={sortBase}
          />
          {items.length === GIOI_HAN && (
            <p className="muted small">
              Đang hiện {GIOI_HAN} dòng gần nhất. Lọc theo người hoặc loại để
              thu hẹp.
            </p>
          )}
        </>
      )}
    </>
  );
}
