"use client";

import { useMemo } from "react";
import type { FaceShape, Point } from "@/lib/face-analysis";
import { buildPlacement, type LessonRegion, type Technique } from "@/lib/placement-map";
import type { FaceBlueprint } from "@/lib/face-blueprint";

/**
 * Draws one lesson step the way a makeup artist charts it: the outline of where
 * the product belongs, arrows for which way to blend it, and a numbered badge
 * naming the area.
 */
export type GuideProps = {
  points: Point[]; areas: LessonRegion[]; technique: Technique; shape: FaceShape | null;
  blueprint?: FaceBlueprint | null;
  /** Photo width ÷ height, so the chart is never stretched out of shape. */
  aspect?: number;
  /** Optional portrait display crop. Geometry still uses the uncropped camera aspect. */
  displayAspect?: number;
  id?: string;
  /** A finished step: outline only, kept on the chart as visual buildup. */
  soft?: boolean;
  /** The routine position shown in each zone's badge. */
  stepNumber?: number;
  /** Freezes the blending arrows without hiding them. */
  paused?: boolean;
  /** Keeps part-by-part mode confined to the feature the user selected. */
  focused?: boolean;
  /** The live mirror is flipped, so badges must be flipped back to stay readable. */
  mirrored?: boolean;
};

export function PlacementGuide({
  points, areas, technique, shape, blueprint = null, aspect = 0.75, displayAspect, id = "current",
  soft = false, stepNumber, paused = false, focused = false, mirrored = false,
}: GuideProps) {
  const zones = useMemo(
    () => buildPlacement(points, areas, technique, shape, aspect, !focused, blueprint),
    [points, areas, technique, shape, aspect, focused, blueprint],
  );
  if (!zones.length) return null;
  const labelPosition = (sourceX: number, sourceY: number) => {
    let x = sourceX / aspect;
    let y = sourceY;
    if (displayAspect && Math.abs(displayAspect - aspect) > .001) {
      if (aspect > displayAspect) x = (sourceX - (aspect - displayAspect) / 2) / displayAspect;
      else {
        const visibleHeight = aspect / displayAspect;
        y = (sourceY - (1 - visibleHeight) / 2) / visibleHeight;
      }
    }
    return { left: `${Math.max(2, Math.min(98, x * 100))}%`, top: `${Math.max(2, Math.min(98, y * 100))}%` };
  };
  const markerId = `guide-arrow-${id.replace(/[^a-z0-9-]/gi, "")}`;
  const description = `${technique} placement on ${zones.map(zone => zone.label.toLowerCase()).join(", ")}`;
  return <>
    <svg
      className={`placement-overlay technique-${technique}${soft ? " completed-placement" : ""}${paused ? " motion-paused" : ""}`}
      viewBox={`0 0 ${aspect} 1`} preserveAspectRatio={displayAspect ? "xMidYMid slice" : "xMidYMid meet"}
      role="img" aria-label={soft ? `Completed: ${description}` : `Where to apply — ${description}`}
    >
      <defs>
        <marker id={markerId} markerWidth="4.6" markerHeight="4.6" refX="3.3" refY="1.7" orient="auto" markerUnits="strokeWidth">
          <path d="M0,0 L0,3.4 L4,1.7 z" />
        </marker>
      </defs>
      {zones.map(zone => <g key={zone.id}>
        {/* Stroke width is kept constant on screen so outlines stay crisp at any photo size. */}
        <path className="placement-zone" d={zone.outline} vectorEffect="non-scaling-stroke" />
        {!soft && zone.arrows.map((path, index) => (
          <path
            key={index} className="application-arrow" d={path}
            markerEnd={`url(#${markerId})`} vectorEffect="non-scaling-stroke"
            style={{ animationDelay: `${index * 0.28}s` }}
          />
        ))}
      </g>)}
    </svg>
    {stepNumber !== undefined && (
      <div className={`placement-labels${soft ? " completed-labels" : ""}`} aria-hidden="true">
        {zones.map(zone => (
          <span
            key={zone.id}
            // Labels sit outward from the face, so left and right zones at the
            // same height never print on top of one another.
            className={`zone-badge technique-${technique} ${zone.side === 0 ? "side-center" : (zone.side === -1) !== mirrored ? "side-left" : "side-right"}`}
            style={labelPosition(mirrored ? aspect - zone.anchor.x : zone.anchor.x, zone.anchor.y)}
          >
            <b>{String(stepNumber).padStart(2, "0")}</b>
            {/* Name the area only when a step marks one place. Paired zones are
                already named in the caption, and printing four labels on one
                face crowds the chart and runs off the edge on a phone. */}
            {!soft && zones.length === 1 && <small>{zone.label}</small>}
          </span>
        ))}
      </div>
    )}
  </>;
}
