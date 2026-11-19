import { useEffect, useState } from "react";

/**
 * Lets the user drop a file anywhere on the window.
 * @param onDrop Receives the drop payload.
 * @param enabled Turn off while a modal is open.
 * @returns True while a file is being dragged over the window.
 */
export function useWindowFileDrop(onDrop: (transfer: DataTransfer) => void, enabled = true): boolean {
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    // dragenter/dragleave fire for every child element; counting them avoids flicker.
    let depth = 0;
    const carriesFiles = (event: DragEvent) => event.dataTransfer?.types.includes("Files") ?? false;

    const onEnter = (event: DragEvent) => {
      if (!carriesFiles(event)) return;
      event.preventDefault();
      depth++;
      setDragging(true);
    };
    const onOver = (event: DragEvent) => {
      if (!carriesFiles(event)) return;
      event.preventDefault(); // without this the browser opens the file itself
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    };
    const onLeave = (event: DragEvent) => {
      if (!carriesFiles(event)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const onDropEvent = (event: DragEvent) => {
      if (!carriesFiles(event) || !event.dataTransfer) return;
      event.preventDefault();
      depth = 0;
      setDragging(false);
      onDrop(event.dataTransfer);
    };

    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragover", onOver);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("drop", onDropEvent);
    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("drop", onDropEvent);
    };
  }, [onDrop, enabled]);

  return dragging;
}
