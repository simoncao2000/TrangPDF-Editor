import { ImagePlus } from "lucide-react";
import { useRef, useState, type ChangeEvent } from "react";
import { useImageTool, type PendingImage } from "../../state/image-store";

/**
 * Reads a picked picture file and how big it is.
 * @param file A PNG or JPEG.
 * @returns The picture, or `null` when it is not a PNG or JPEG the browser can read.
 */
async function readImage(file: File): Promise<PendingImage | null> {
  const format = file.type === "image/png" ? "png" : file.type === "image/jpeg" ? "jpeg" : null;
  if (!format) return null;
  try {
    const bitmap = await createImageBitmap(file);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return { file: { bytes: await file.arrayBuffer(), format }, name: file.name, ...size };
  } catch {
    return null;
  }
}

/**
 * The Image tool's options: the picture to place, and whether resizing keeps its proportions.
 * @returns The picker.
 */
export function ImagePicker() {
  const { pending, choose, keepProportions, setKeepProportions } = useImageTool();
  const input = useRef<HTMLInputElement>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const onPick = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const image = await readImage(file);
    setProblem(image ? null : "That file isn’t a PNG or JPEG image this browser can read.");
    if (image) choose(image);
  };

  return (
    <div className="grid gap-3">
      <p className="text-sm text-muted">PNG or JPEG. The image is embedded in the PDF when you save.</p>
      {pending && (
        <p className="truncate text-sm text-ink">
          {pending.name} · {pending.width} × {pending.height}
        </p>
      )}
      <button
        type="button"
        onClick={() => input.current?.click()}
        className="flex h-9 items-center justify-center gap-1.5 rounded-sm border border-line text-sm text-ink transition-colors duration-(--duration-press) hover:bg-hover"
      >
        <ImagePlus className="size-4" aria-hidden="true" />
        {pending ? "Choose another image…" : "Choose image…"}
      </button>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg"
        className="hidden"
        onChange={(event) => void onPick(event)}
      />
      {problem && <p className="text-sm text-danger">{problem}</p>}
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={keepProportions}
          onChange={(event) => setKeepProportions(event.target.checked)}
          className="accent-(--color-action)"
        />
        Keep proportions when resizing
      </label>
    </div>
  );
}
