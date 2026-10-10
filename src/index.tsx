import { render } from "@solidjs/web";
import "./index.css";
import "./lib/theme"; // apply light/dark before first paint
import "./i18n"; // apply language + direction before first paint
import App from "./App";

render(() => <App />, document.getElementById("root")!);
