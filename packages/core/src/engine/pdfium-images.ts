/**
 * Pictures placed on a page, as stamp annotations whose appearance is one image object stretched
 * over the stamp's rectangle. PDFium draws them. The picture is put in once, at the first size;
 * moving or resizing changes only the stamp's rectangle, and PDFium stretches the appearance to it.
 */
import type { WrappedPdfiumModule } from "@embedpdf/pdfium";
import type { ImageAnnotation, ImageFile } from "../annotations/annotation";
import { MATRIX_BYTES } from "./pdfium-text-measure";
import { PdfiumHeap } from "./pdfium-heap";

export class AnnotationImages {
  private readonly pdfium: WrappedPdfiumModule;
  private readonly heap: PdfiumHeap;

  /**
   * @param pdfium An initialised PDFium module.
   */
  constructor(pdfium: WrappedPdfiumModule) {
    this.pdfium = pdfium;
    this.heap = new PdfiumHeap(pdfium);
  }

  /**
   * Puts the picture in a stamp the first time, stretched over the stamp's rectangle. Later writes
   * have nothing to do here: the stamp's new rectangle already moves and stretches its appearance.
   * @param doc The document handle (the picture belongs to it).
   * @param annot The stamp's handle; its rectangle is already set.
   * @param annotation The image record (its picture is needed only the first time).
   * @returns False if the stamp has no picture and the record brings none, or PDFium refused it.
   */
  write(doc: number, annot: number, annotation: ImageAnnotation): boolean {
    if (this.pdfium.FPDFAnnot_GetObjectCount(annot) > 0) return true;
    const picture = annotation.image ? this.load(doc, annotation.image) : 0;
    if (!picture) return false;
    this.place(picture, annotation);
    return this.pdfium.FPDFAnnot_AppendObject(annot, picture);
  }

  /**
   * Makes an image object from a PNG or JPEG file.
   * @param doc The document handle.
   * @param file The file and its format.
   * @returns The image object, or 0 if PDFium could not read the file.
   */
  private load(doc: number, { bytes, format }: ImageFile): number {
    const picture = this.pdfium.FPDFPageObj_NewImageObj(doc);
    if (!picture) return 0;
    const data = new Uint8Array(bytes);
    const loaded = this.heap.withBuffer(data.length, (ptr) => {
      this.pdfium.pdfium.HEAPU8.set(data, ptr);
      // (pages, page count, image object, data, length): no pages need refreshing.
      return format === "png"
        ? this.pdfium.EPDFImageObj_SetPng(0, 0, picture, ptr, data.length)
        : this.pdfium.EPDFImageObj_SetJpeg(0, 0, picture, ptr, data.length);
    });
    if (loaded) return picture;
    this.pdfium.FPDFPageObj_Destroy(picture);
    return 0;
  }

  /**
   * Stretches an image object over a rectangle (an image is drawn in a 1 × 1 box its matrix scales).
   * @param picture The image object.
   * @param annotation The image record, for its rectangle.
   */
  private place(picture: number, annotation: ImageAnnotation): void {
    const { x, y, width, height } = annotation.rect;
    this.heap.withBuffer(MATRIX_BYTES, (ptr) => {
      this.heap.writeFloats(ptr, [width, 0, 0, height, x, y]);
      this.pdfium.FPDFPageObj_SetMatrix(picture, ptr);
    });
  }
}
