import { describe, expect, it } from "bun:test";
import { migrateSignatures, useSignatures, type TypedSignature } from "./signature-store";

describe("signature storage migration", () => {
  it("keeps drawn signatures and the selection from version one", () => {
    const signature = {
      id: "original",
      strokes: [
        [
          { x: 0, y: 0 },
          { x: 1, y: 0.5 },
        ],
      ],
      aspect: 0.5,
    };
    expect(migrateSignatures({ signatures: [signature], currentId: signature.id })).toEqual({
      signatures: [{ ...signature, kind: "drawn" }],
      currentId: signature.id,
      lastMode: "drawn",
    });
  });

  it("treats missing and malformed signatures as an empty list", () => {
    expect(migrateSignatures(undefined)).toEqual({ signatures: [], currentId: null, lastMode: "drawn" });
    expect(migrateSignatures({ signatures: "invalid" })).toEqual({
      signatures: [],
      currentId: null,
      lastMode: "drawn",
    });
  });

  it("adds a typed signature and records typed as the last mode", () => {
    const signature: TypedSignature = {
      id: "typed",
      kind: "typed",
      text: "Ada Lovelace",
      style: "flowing",
      ink: "black",
    };
    useSignatures.setState({ signatures: [], currentId: null, lastMode: "drawn", temporary: null, drawing: false });
    useSignatures.getState().add(signature);
    expect(useSignatures.getState().lastMode).toBe("typed");
  });

  it("clears the temporary signature when choosing a saved one", () => {
    const signature: TypedSignature = {
      id: "temporary",
      kind: "typed",
      text: "Ada Lovelace",
      style: "flowing",
      ink: "black",
    };
    useSignatures.setState({
      signatures: [],
      currentId: null,
      lastMode: "drawn",
      temporary: signature,
      drawing: false,
    });
    useSignatures.getState().choose("saved");
    expect(useSignatures.getState().temporary).toBeNull();
  });
});
