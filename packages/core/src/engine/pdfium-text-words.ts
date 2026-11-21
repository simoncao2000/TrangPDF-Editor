/**
 * Writing a line one text object per word, for fonts that cannot draw spaces: pdfTeX subset fonts
 * give the space no width and make word gaps by moving the pen. Each word is written in the
 * original font, placed one advance after the previous word plus the original gap, and marked as
 * part of its line (`pdfium-line-marks.ts`).
 */
import type { WrappedPdfiumModule } from "@embedpdf/pdfium";
import type { PageContext } from "./pdfium-page-text";
import { LineMarks, type LineMark } from "./pdfium-line-marks";
import { MIN_SPACE_EM, TextMeasure, widthOf, type FontFace } from "./pdfium-text-measure";
import { TextObjectAccess, type TextPlacement } from "./pdfium-text-object";

/** Word gap used when the original line has none to measure (a single word), in em. */
const DEFAULT_WORD_GAP_EM = 0.3;

/** A word and where it starts along the line's baseline, from the line's origin. */
interface PlacedWord {
  readonly word: string;
  /** Text space units. */
  readonly offset: number;
}

export class WordWriter {
  private readonly pdfium: WrappedPdfiumModule;
  private readonly objects: TextObjectAccess;
  private readonly measure: TextMeasure;
  private readonly marks: LineMarks;

  /**
   * @param pdfium An initialised PDFium module.
   */
  constructor(pdfium: WrappedPdfiumModule) {
    this.pdfium = pdfium;
    this.objects = new TextObjectAccess(pdfium);
    this.measure = new TextMeasure(pdfium);
    this.marks = new LineMarks(pdfium);
  }

  /**
   * Writes text one object per word in the model's font, every word marked as part of `line`.
   * @param page The page being edited.
   * @param placement Where the first word goes and what the words are modelled on.
   * @param line The new line's id and word gap.
   * @param text The new text, whose letters the font has.
   * @returns The words, or `null` if the text is one word or PDFium refused a word.
   */
  write(page: PageContext, placement: TextPlacement, line: LineMark, text: string): number[] | null {
    if (!/\S\s+\S/.test(text)) return null;
    const face = this.faceOf(page.doc, placement.model.object);
    const placed = this.layOut(face, text, line.gap);
    if (!placed) return null;
    const made: number[] = [];
    for (const [i, { word, offset }] of placed.entries()) {
      const created = this.pdfium.FPDFPageObj_CreateTextObj(face.doc, face.font, face.size);
      const object = this.objects.insertLike(
        page.page,
        { ...placement, at: placement.at + i, shift: offset },
        created,
        word,
      );
      if (object) made.push(object);
      if (!object || !this.marks.tag(face.doc, object, line)) {
        this.objects.discard(page.page, made);
        return null;
      }
    }
    return made;
  }

  /**
   * The space between words of a line, in text space units: what its line mark records, or else
   * measured from the original (its length minus its words', shared among its spaces).
   * @param page The page being edited.
   * @param originals The line's objects, still switched on (PDFium cannot read switched-off text).
   * @returns The gap; `DEFAULT_WORD_GAP_EM` when there is nothing to measure.
   */
  gapOf(page: PageContext, originals: readonly number[]): number {
    const first = originals[0]!;
    const face = this.faceOf(page.doc, first);
    const smallest = face.size * MIN_SPACE_EM;
    const marked = this.marks.lineOf(first)?.gap ?? 0;
    if (marked >= smallest) return marked;
    if (originals.length === 1) {
      const text = this.objects.withTextPage(page.page, (textPage) => this.objects.readText(textPage, first)).trim();
      const spaces = text.match(/\s/g)?.length ?? 0;
      const words = this.measure.inkOf(face, text.replace(/\s/g, ""));
      const measured = spaces > 0 && words ? (this.measure.lengthAlongBaseline(first) - widthOf(words)) / spaces : 0;
      if (measured >= smallest) return measured;
    }
    return face.size * DEFAULT_WORD_GAP_EM;
  }

  /**
   * The font a text object is drawn in.
   * @param doc The document handle.
   * @param object A text object.
   * @returns Its font, size and document.
   */
  faceOf(doc: number, object: number): FontFace {
    return { doc, font: this.pdfium.FPDFTextObj_GetFont(object), size: this.objects.fontSizeOf(object) };
  }

  /**
   * Where each word of a text goes along the baseline: each word starts one advance after the
   * previous one plus a gap per space, as a TJ array with word gaps would place it.
   * @param face The font, size and document.
   * @param text The text.
   * @param gap The space between words, in text space units.
   * @returns The words and their offsets, or `null` if a word cannot be written.
   */
  private layOut(face: FontFace, text: string, gap: number): PlacedWord[] | null {
    const placed: PlacedWord[] = [];
    let pen = 0;
    for (const token of text.trimEnd().split(/(\s+)/).filter(Boolean)) {
      if (/^\s/.test(token)) {
        pen += token.length * gap;
        continue;
      }
      const advance = this.measure.advanceOf(face, token);
      if (advance === null) return null;
      placed.push({ word: token, offset: pen });
      pen += advance;
    }
    return placed;
  }
}
