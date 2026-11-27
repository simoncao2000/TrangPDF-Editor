/** Shared enter and exit motion for phone trays and tool columns. */
export const PHONE_SURFACE_MOTION = [
  "transition-[opacity,transform] ease-(--curve-out) motion-reduce:transition-opacity",
  "duration-[240ms] starting:opacity-0 motion-safe:starting:transform-[translateY(14px)_scale(.94)]",
  "data-[closed]:opacity-0 data-[closed]:duration-(--duration-exit)",
  "motion-safe:data-[closed]:transform-[translateY(14px)_scale(.94)]",
].join(" ");
