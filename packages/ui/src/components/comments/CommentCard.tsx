import { pdfRectToScreen, type Annotation, type PageFrame } from "@pdf-editor/core";
import { CommentThread } from "./CommentThread";

/** The card's width in CSS pixels (18rem), and its gap from the mark and the page's edge. */
const CARD_WIDTH = 288;
const GAP = 8;

interface CommentCardProps {
  readonly pageId: string;
  readonly annotation: Annotation;
  readonly frame: PageFrame;
  /** The page's on-screen width, so the card stays over the page. */
  readonly pageWidth: number;
}

/**
 * The selected mark's comment thread, opened on the page just below the mark, as in Acrobat.
 * @param props The page, the mark, how the page is shown, and its width.
 * @returns The card.
 */
export function CommentCard({ pageId, annotation, frame, pageWidth }: CommentCardProps) {
  const box = pdfRectToScreen(annotation.rect, frame);
  const left = Math.max(GAP, Math.min(box.left, pageWidth - CARD_WIDTH - GAP));
  return (
    <div
      // Presses inside the card are not presses on the page (they must not deselect the mark).
      data-annotation=""
      className="absolute z-20 rounded-md shadow-2"
      style={{ left, top: box.top + box.height + GAP, width: CARD_WIDTH }}
    >
      <CommentThread pageId={pageId} annotation={annotation} open />
    </div>
  );
}
