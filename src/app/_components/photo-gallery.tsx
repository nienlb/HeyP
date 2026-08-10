import { PHOTO_LABELS, PHOTO_LABEL_LABELS, type PhotoLabel } from "@/lib/photos";
import { CopyImageButton } from "./copy-image-button";

export type GalleryPhoto = { id: number; label: PhotoLabel };

export function PhotoGallery({
  photos,
  copy = false,
}: {
  photos: GalleryPhoto[];
  copy?: boolean;
}) {
  if (photos.length === 0) {
    return <p className="muted">Chưa có ảnh.</p>;
  }

  const groups = PHOTO_LABELS.map((label) => ({
    label,
    items: photos.filter((p) => p.label === label),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="gallery">
      {groups.map((g) => (
        <div key={g.label} className="gallery-group">
          <div className="gallery-label">
            {PHOTO_LABEL_LABELS[g.label]} ({g.items.length})
          </div>
          <div className="thumbs">
            {g.items.map((p) => (
              <figure key={p.id} className="thumb">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/photo/${p.id}`} alt={PHOTO_LABEL_LABELS[g.label]} />
                <figcaption>
                  <a
                    href={`/api/photo/${p.id}?download`}
                    className="btn btn-ghost btn-sm"
                  >
                    Tải về
                  </a>
                  {copy && <CopyImageButton photoId={p.id} />}
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
