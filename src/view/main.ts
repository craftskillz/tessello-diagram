// The View: the list of diagrams, and the canvas of the open one.

import { connect } from "@tessello/sdk";
import { mount } from "svelte";
import "../lib/base.css";
import { setLocale } from "../lib/i18n.ts";
import { applyParams, connectStore, load } from "../lib/store.svelte.ts";
import { applyTheme } from "../lib/theme.ts";
import View from "./View.svelte";

const host = await connect();
setLocale(host.context.locale);
document.documentElement.lang = host.context.locale;
applyTheme(host.context.theme);
host.onThemeChange(applyTheme);
connectStore(host);
applyParams(host.context.params);
host.onNavigationParams(applyParams);
// Read again when shown: the diagrams may have changed while the View waited behind the Home.
host.onVisibilityChange((visible) => visible && void load());

mount(View, { target: document.body });
await load();
