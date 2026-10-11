import { render } from "@solidjs/web";
// Fonts are self-hosted (precached by the service worker, so they work offline).
import "@fontsource/outfit/latin-400.css";
import "@fontsource/outfit/latin-500.css";
import "@fontsource/outfit/latin-600.css";
import "@fontsource/outfit/latin-700.css";
import "@fontsource/manrope/latin-400.css";
import "@fontsource/manrope/latin-500.css";
import "@fontsource/manrope/latin-600.css";
import "@fontsource/manrope/latin-700.css";
import "@fontsource/newsreader/latin-400.css";
import "@fontsource/newsreader/latin-500.css";
import "@fontsource/unbounded/latin-500.css";
import "@fontsource/noto-sans-arabic/arabic-400.css";
import "@fontsource/noto-sans-arabic/arabic-600.css";
import "./index.css";
import "./lib/theme"; // apply light/dark before first paint
import "./i18n"; // apply language + direction before first paint
import App from "./App";

render(() => <App />, document.getElementById("root")!);
