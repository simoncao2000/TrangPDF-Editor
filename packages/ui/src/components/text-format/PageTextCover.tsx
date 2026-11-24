import type { ComponentProps } from "react";

interface PageTextCoverProps extends Pick<ComponentProps<"div">, "children" | "onKeyDownCapture" | "style"> {
  background: string;
  width: number;
  height: number;
}

/**
 * Keeps the sampled paper behind the draft over the full area occupied by the original glyphs.
 * @param props The paper colour, original line dimensions and editable content.
 * @returns The positioned cover and its contents.
 */
export function PageTextCover({ background, width, height, style, ...content }: PageTextCoverProps) {
  return (
    <div
      {...content}
      className="absolute grid w-max items-center rounded-xs outline-2 outline-offset-1 outline-paper-focus/70 outline-dashed"
      style={{ ...style, backgroundColor: background, minWidth: width, minHeight: height }}
    />
  );
}
