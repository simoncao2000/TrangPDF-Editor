import { EditorApp, EditorProvider } from "@pdf-editor/ui";
import { createWebServices } from "./services";

const services = createWebServices();

/**
 * The web shell: provides the browser services to the shared editor UI.
 * @returns The editor.
 */
export default function App() {
  return (
    <EditorProvider services={services}>
      <EditorApp />
    </EditorProvider>
  );
}
