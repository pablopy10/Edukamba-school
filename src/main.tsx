import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { queryClient } from "./lib/queryClient";
import { tryHydrateQueryClientFromStorage } from "./lib/queryPersister";

tryHydrateQueryClientFromStorage(queryClient);

createRoot(document.getElementById("root")!).render(<App />);
