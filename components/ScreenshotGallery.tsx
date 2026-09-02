import type { Screenshot } from "@/lib/types";

// Inline captures arrive as JPEG data URLs and bundled ones as public paths.
// Nothing else is a valid image source for a report.
function imageSource(shot: Screenshot): string | null {
  const candidate = shot.dataUrl ?? shot.path ?? "";
  if (candidate.startsWith("data:image/")) return candidate;
  if (candidate.startsWith("/") && !candidate.startsWith("//")) return candidate;
  return null;
}

export function ScreenshotGallery({ screenshots }: { screenshots: Screenshot[] }) {
  // A capture that exceeded the size cap carries neither a data URL nor a path.
  const shown = screenshots
    .map((shot) => ({ shot, source: imageSource(shot) }))
    .filter((entry): entry is { shot: Screenshot; source: string } => entry.source !== null);
  if (shown.length === 0) return null;

  return (
    <section className="card section">
      <h2 className="section-head">Trust surface evidence</h2>
      <div className="gallery">
        {shown.map(({ shot, source }) => (
          <figure key={shot.id}>
            {/* A full page capture can run to several thousand pixels. It is
                kept whole and scrolled inside its frame rather than cropped out
                of the report. */}
            <div className="shot-frame">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={source} alt={`Screenshot of ${shot.url}`} loading="lazy" />
            </div>
            {/* The capture URL is quoted from the target, so it stays in mono. */}
            <figcaption className="mono muted">{shot.url}</figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
