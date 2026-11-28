import { createBrowserHistory, EditorApp, EditorProvider, EditorRouter } from "@pdf-editor/ui";
import { createWebServices } from "./services";

const services = createWebServices();
const history = createBrowserHistory();

/**
 * The web shell: provides the browser services to the shared editor UI.
 * @returns The editor.
 */
export default function App() {
  return (
    <EditorProvider services={services}>
      <EditorRouter history={history}>
        <EditorApp />
      </EditorRouter>
    </EditorProvider>
  );
}
