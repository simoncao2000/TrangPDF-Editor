import type { PdfPoint, Rgb } from "./pdf";

/** Standard PDF families used for added text. */
export type TextRunFamily = "Helvetica" | "Times" | "Courier";

/** A face used by page text. Embedded identifiers are independent of asset locations. */
export type TextRunFont =
  | { readonly kind: "standard"; readonly family: TextRunFamily }
  | {
      readonly kind: "embedded";
      readonly fontId: string;
      readonly name: string;
      readonly weight: 400 | 700;
      readonly italic: boolean;
      readonly documentFontId?: string;
    };

/** One span with a uniform style, in PDF points and RGB channels. */
export interface TextRun {
  readonly text: string;
  /** Original run width along its baseline, in PDF points. */
  readonly originalWidth?: number;
  /** Original run baseline origin, in PDF points. */
  readonly baseline?: PdfPoint;
  readonly fontFamily?: TextRunFamily;
  readonly font?: TextRunFont;
  readonly fontSize: number;
  readonly bold: boolean;
  readonly italic: boolean;
  readonly underline: boolean;
  readonly color: Rgb;
}

/** Paragraphs of text, including empty lines. */
export type TextRunLines = readonly (readonly TextRun[])[];

/** Glyph coverage reported for a requested document face. */
export interface TextRunFontCheck {
  readonly missingCharacter?: string;
}
