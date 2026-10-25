# Expo SDK 54 → 57 upgrade research

Research only. Nothing was installed, no `package.json` or `node_modules` was touched, the app
was not run. The only file written by this investigation is this one.

Date of research: 2026-09-09.

## Versions this was researched against

Current, read from `C:\Users\Administrator\NutriSA_APP\package.json` (lines 5–59) — **verified**:

| | |
|---|---|
| `expo` | `~54.0.36` |
| `react-native` | `0.81.5` |
| `react` / `react-dom` | `19.1.0` |
| `expo-router` | `~6.0.24` (installed: `6.0.24`, `node_modules/expo-router/package.json`) |
| `nativewind` | `^4.2.6` |
| `tailwindcss` | `^3.4.19` |
| `typescript` | `~5.9.2` |
| Node on this machine | `v22.14.0`, npm `10.9.2` |

Target SDK: **57.0.0**.

Primary sources read:

- `https://api.expo.dev/v2/versions/latest` — the `sdkVersions["57.0.0"]` entry
  (`facebookReactVersion`, `facebookReactNativeVersion`, `relatedPackages`).
- `https://api.expo.dev/v2/sdks/57.0.0/native-modules` — the authoritative bundled-native-modules
  list, i.e. exactly what `npx expo install --fix` resolves to. Also fetched for 55.0.0 and 56.0.0.
- `https://docs.expo.dev/versions/v57.0.0/`
- `https://docs.expo.dev/router/advanced/native-tabs/`
- `https://expo.dev/changelog/sdk-55`, `/sdk-56`, `/sdk-57`
- `expo-router@57.0.20`, `@expo/config-types@57.0.2`, `babel-preset-expo@57.0.11`,
  `expo-splash-screen@57.0.8`, `sf-symbols-typescript@2.1.0` — npm tarballs unpacked into the
  session scratchpad and their `.d.ts` files read directly. This is the highest-trust source for
  the SDK 57 API shape; `node_modules/` in this repo is SDK 54 and is used here only for the
  "before" side of the diff.
- `npm view` (read-only) for dist-tags, publish dates and peer dependencies.

---

## 0. Contradictions with AGENTS.md and plan.md — read this first

Everything below contradicts the standing SDK-54 pin. That is **expected**: the pin carries its own
release condition, and the condition has now been met.

> `AGENTS.md:49-51` — "The SDK moves only when Sriman confirms the Expo Go app on the iPhone
> reports a new number. Verify against the device, never against `docs.expo.dev/versions/latest`."

The premise reported to this session is that the App Store Expo Go binary now reports **57**.
That report is the trigger the pin was written to wait for. **Unverified by me** — I cannot read the
phone; it rests entirely on Sriman's device check, which is exactly the authority AGENTS.md names.

### Lines that assert the 54 pin and will need rewriting

`C:\Users\Administrator\NutriSA_APP\AGENTS.md`:

| Line(s) | What it says | Needs |
|---|---|---|
| 6 | "read the exact versioned docs … `https://docs.expo.dev/versions/v54.0.0/`" | → `v57.0.0` |
| 18 | Stack table: "App \| Expo SDK **54**, React Native 0.81.5 — **pinned, see below**" | → SDK 57, RN 0.86.3 |
| 35 | Heading: "## The SDK is pinned to 54 — do not upgrade it" | → pinned to 57 |
| 37 | "Expo Go from the App Store supports exactly one SDK at a time, and right now that is 54." | → 57 |
| 42–44 | "an upgrade to SDK 57 typechecked clean … had to be fully reverted" | keep as history, but re-date and note it succeeded on the second attempt once Expo Go caught up |
| 46–48 | "Do not run `npx expo install expo@^<newer> --fix`" / `eas go` needs the paid account | the `eas go` note is now moot for 57; keep the general rule |
| 49–51 | The release condition | condition met; restate for the *next* SDK (58) |
| 63–64 | "it changed between SDK 54 and 55. Check the **SDK 54** docs" | → the compound form is now the shape; point at SDK 57 docs |
| 65–68 | "Native Tabs under Expo Go on SDK 54 is **verified** — on the iPhone 15, 2026-08-10 … `react-native-screens` 4.16.0" | the verification is now stale; `react-native-screens` becomes `~4.26.0` and needs re-verifying on device |

`C:\Users\Administrator\NutriSA_APP\plan.md`:

| Line(s) | What it says | Needs |
|---|---|---|
| 187–194 | "**SDK 57 upgrade attempted and reverted — 2026-08-10.** … the iPhone reports SDK 54." | rewrite as resolved: the blocker was Apple review latency, not the code |
| 621–625 | "Native Tabs via `expo-router/unstable-native-tabs`, SDK 54 API (`Icon` / `Label` imported alongside `NativeTabs`, not the compound form of SDK 55+). … **Android renders labels with no icons** because SDK 54's `Icon` wants an Android drawable" | the compound form is now correct, **and** SDK 57's `Icon` gained an `md` (Material Symbols) prop that closes the Android gap without a drawable — see §2 |
| 1281–1291 | "**Do Native Tabs work in Expo Go on SDK 54? Yes — verified on the iPhone 15, 2026-08-10.** … lives in `react-native-screens` 4.16.0 … `expo-router` 6.0.24 carries an explicit 4.16-vs-4.18 icon branch (`NativeTabsView.js:220`)" | that whole answer is version-specific and now stale; the Android caveat about `sf=` being iOS-only is softened by `md` |
| 1340–1341 | "**Which SDK does App Store Expo Go support?** … Re-check before any SDK bump" | answered (57, per Sriman's device); reset the question for 58 |

Also worth noting: the memory entry `expo-typedroutes-stale.md` still applies — `router.d.ts` will be
regenerated and stale-typed-route `tsc` noise should be expected during the upgrade.

---

## 1. Version table — SDK 57 exact pins

**Verified** unless marked. Target column is from
`https://api.expo.dev/v2/sdks/57.0.0/native-modules` (the list `expo install --fix` uses) except
where noted; `relatedPackages` values come from `https://api.expo.dev/v2/versions/latest`
→ `sdkVersions["57.0.0"].relatedPackages`.

### Core

| Package | Current | SDK 57 target | Source |
|---|---|---|---|
| `expo` | `~54.0.36` | `~57.0.21` | npm dist-tag `latest` = `57.0.21` (`npm view expo dist-tags`) |
| `react-native` | `0.81.5` | `0.86.3` | native-modules + `facebookReactNativeVersion` |
| `react` | `19.1.0` | `19.2.3` | `facebookReactVersion` |
| `react-dom` | `19.1.0` | `19.2.3` | **inferred** — Expo pins `react-dom` to the same version as `react`; `relatedPackages` only carries `@types/react-dom ~19.2.3` |
| `react-native-web` | `^0.21.0` | `~0.21.0` | native-modules. `relatedPackages` says `^0.21.2` — both are satisfied by `^0.21.2`; prefer `~0.21.0` because that is what `expo install --fix` writes |

### expo-\* modules

Note the shape change: **from SDK 55 onward every Expo module is versioned to the SDK number**
(verified by comparing the 55/56/57 native-modules lists: `expo-crypto` is `~55.0.19` / `~56.0.5` /
`~57.0.2`). So `expo-crypto` goes `15.x → 57.x` and that is not a mistake.

| Package | Current | SDK 57 target |
|---|---|---|
| `expo-auth-session` | `~7.0.11` | `~57.0.11` |
| `expo-constants` | `~18.0.13` | `~57.0.17` |
| `expo-crypto` | `~15.0.9` | `~57.0.2` |
| `expo-dev-client` | `~6.0.21` | `~57.0.18` |
| `expo-device` | `~8.0.10` | `~57.0.1` |
| `expo-font` | `~14.0.12` | `~57.0.3` |
| `expo-image` | `~3.0.11` | `~57.0.4` |
| `expo-linear-gradient` | `~15.0.8` | `~57.0.1` |
| `expo-linking` | `~8.0.12` | `~57.0.9` |
| `expo-router` | `~6.0.24` | `~57.0.20` |
| `expo-secure-store` | `~15.0.8` | `~57.0.3` |
| `expo-splash-screen` | `~31.0.13` | `~57.0.8` |
| `expo-status-bar` | `~3.0.9` | `~57.0.1` |
| `expo-system-ui` | `~6.0.9` | `~57.0.3` |
| `expo-web-browser` | `~15.0.11` | `~57.0.2` |

### react-native-\* and third party

| Package | Current | SDK 57 target | Note |
|---|---|---|---|
| `react-native-gesture-handler` | `~2.28.0` | `~2.32.0` | |
| `react-native-reanimated` | `~4.1.1` | `4.5.1` | exact pin, no range |
| `react-native-safe-area-context` | `~5.6.0` | `~5.7.0` | |
| `react-native-screens` | `~4.16.0` | `~4.26.0` | `expo-router@57.0.20` peer-requires `^4.26.0` (tarball `package.json`) |
| `react-native-svg` | `15.12.1` | `15.15.4` | exact pin |
| `react-native-worklets` | `0.5.1` | `0.10.1` | exact pin |
| `@sentry/react-native` | `~7.2.0` | `~7.11.0` | native-modules. npm `latest` is `8.25.0` — **do not** take 8.x; Expo pins 7.11 |
| `nativewind` | `^4.2.6` | *(not an Expo module — stays `^4.2.6`)* | see §3 |
| `tailwindcss` | `^3.4.19` | *(stays `^3`)* | `react-native-css-interop@0.2.6` peers `tailwindcss: "~3"` (**verified** via `npm view`) |
| `@expo-google-fonts/barlow` / `-condensed` | `^0.4.1` | `0.4.1` | not SDK-versioned; `latest` is still `0.4.1` |
| `@clerk/expo` | `^4.2.3` | `^4.6.5` (npm `latest`) | peer `expo: ">=54 <58"` — **explicitly supports 57**, verified via `npm view @clerk/expo@4.6.5 peerDependencies` |

### devDependencies

| Package | Current | SDK 57 target | Source |
|---|---|---|---|
| `babel-preset-expo` | `~54.0.10` | `~57.0.11` | `relatedPackages` says `~57.0.0`; npm dist-tag `latest` = `57.0.11` |
| `@types/react` | `~19.1.10` | `~19.2.4` | `relatedPackages` |
| `typescript` | `~5.9.2` | `~6.0.3` | `relatedPackages`. **Large jump** — see §3.9 |

### New transitive native modules (no action, but they must be in the Expo Go binary)

`expo-router@57.0.20` now takes these as **direct dependencies** (verified, tarball `package.json`):
`@expo/ui ^57.0.17`, `expo-glass-effect ^57.0.2`, `expo-symbols ^57.0.2`, `expo-server ^57.0.3`,
`@expo/metro-runtime ^57.0.15`, `@react-native-masked-view/masked-view ^0.3.2`,
`react-native-drawer-layout ^4.2.2`, `standard-navigation ^0.0.5`, `sf-symbols-typescript ^2.1.0`.
All the native ones appear in the SDK 57 bundled-native-modules list (`@expo/ui ~57.0.17`,
`expo-glass-effect ~57.0.2`, `expo-symbols ~57.0.2`, `@react-native-masked-view/masked-view 0.3.2`),
so they are part of the SDK 57 Expo Go binary — **inferred** from their presence in that list, not
directly observed in the binary.

### Environment floors

- Node: docs index for v57.0.0 states **22.13.x** minimum. This machine is `v22.14.0` — **OK**.
  (SDK 55 changelog lists `^20.19.4 | ^22.13.0 | ^24.3.0 | ^25.0.0`.)
- iOS **16.4+**, Android **7+**, Xcode **26.4+** (`https://docs.expo.dev/versions/v57.0.0/`).
  Xcode is irrelevant while on Expo Go / CNG.

---

## 2. Native Tabs in SDK 57

All **verified** by reading `expo-router@57.0.20` type definitions from the npm tarball.

### The import path is unchanged

`expo-router/unstable-native-tabs` still exists — the tarball ships
`unstable-native-tabs.d.ts` (`export * from './build/native-tabs';`) and
`unstable-native-tabs.js`. **Verified.**

### `Icon` and `Label` are no longer top-level exports

`build/native-tabs/index.d.ts` in 57.0.20 exports exactly two values:

```
export { NativeTabTrigger } from './NativeTabTrigger';
export { NativeTabs } from './NativeTabs';
```

Everything else in that file is `export type`. Compare the installed SDK 54 build
(`node_modules/expo-router/build/native-tabs/index.d.ts`), whose first line is
`export * from './common/elements';` — that re-export is what makes `Icon` and `Label` importable
today, and it is gone in 57.

The elements are now compound, per `build/native-tabs/NativeTabs.d.ts`:

```
export declare const NativeTabs: ((props: NativeTabsProps) => JSX.Element) & {
    Trigger: ((props: NativeTabTriggerProps) => null) & {
        Label: FC<NativeTabsTriggerLabelProps>;
        Icon: FC<NativeTabsTriggerIconProps>;
        Badge: FC<NativeTabsTriggerBadgeProps>;
        VectorIcon: typeof VectorIcon;
    };
    BottomAccessory: FC<NativeTabsBottomAccessoryProps> & { usePlacement: ... };
};
```

So: `NativeTabs.Trigger.Icon`, `NativeTabs.Trigger.Label`, `NativeTabs.Trigger.Badge`, plus two new
affordances — `NativeTabs.Trigger.VectorIcon` and `NativeTabs.BottomAccessory` (iOS 26+).

### Every `NativeTabs` prop this project uses survives, unrenamed

Read from `build/native-tabs/types.d.ts`, `interface NativeTabsProps` — **verified**:

| Prop used today | Still in 57? | Signature in 57 |
|---|---|---|
| `backgroundColor` | yes | `ColorValue` |
| `shadowColor` | yes | `ColorValue`, `@platform iOS` |
| `tintColor` | yes | `ColorValue` |
| `iconColor` | yes | `ColorValue \| { default?: ColorValue; selected?: ColorValue }` |
| `labelStyle` | yes | `StyleProp<NativeTabsLabelStyle> \| { default?; selected? }` |
| `disableTransparentOnScrollEdge` | yes | `boolean`, `@platform iOS` |

`NativeTabsLabelStyle` is still `Pick<TextStyle, 'fontFamily' | 'fontSize' | 'fontStyle' |
'fontWeight' | 'color'>`, so the `fontFamily: "Barlow_500Medium"` / `fontSize: 11` / `color` object
is still valid.

`Icon`'s `sf` prop still accepts `SFSymbol | { default?: SFSymbol; selected: SFSymbol }`
(`build/native-tabs/common/elements.d.ts`, `interface SFSymbolIcon`). All six SF Symbol strings this
file uses — `square.grid.2x2`, `square.grid.2x2.fill`, `fork.knife`, `scalemass`, `scalemass.fill`,
`sparkles` — are present in `sf-symbols-typescript@2.1.0`'s `dist/index.d.ts` union
(**verified** by grep of the unpacked tarball). No symbol renames to worry about.

New props worth knowing about (not required): `minimizeBehavior`, `blurEffect`, `sidebarAdaptable`,
`badgeBackgroundColor`, `badgeTextColor`, `labelVisibilityMode`, `rippleColor`, `indicatorColor`,
`disableIndicator`, `backBehavior`, `tabBarRespectsIMEInsets` (Android, SDK 56+), `screenListeners`,
`unstable_nativeProps`. On `Trigger`: `hidden`, `disabled`, `role`, `contentStyle`,
`disableAutomaticContentInsets`, `disablePopToTop`, `disableScrollToTop`.

### The Android icon gap has a fix now

`NativeTabsTriggerIconProps` includes a `MaterialIcon` variant — `md?: AndroidSymbol | { default?;
selected }` — so Android icons no longer need a `drawable` resource in a folder CNG owns. Adding
`md="..."` alongside `sf="..."` on each `Icon` would close the gap plan.md:623-625 records as open.
**Verified** that the prop exists; **not attempted**, and out of scope for this branch.

### Before / after for `src/app/(tabs)/_layout.tsx`

Only two things change: the import, and the four `<Icon>` / `<Label>` element names. Nothing else in
the file moves.

```diff
 import { View } from "react-native"
 import { Redirect } from "expo-router"
-import { Icon, Label, NativeTabs } from "expo-router/unstable-native-tabs"
+import { NativeTabs } from "expo-router/unstable-native-tabs"
 import { useAuth } from "@clerk/expo"
```

```diff
       <NativeTabs.Trigger name="index">
-        <Icon sf={{ default: "square.grid.2x2", selected: "square.grid.2x2.fill" }} />
-        <Label>Dashboard</Label>
+        <NativeTabs.Trigger.Icon
+          sf={{ default: "square.grid.2x2", selected: "square.grid.2x2.fill" }}
+        />
+        <NativeTabs.Trigger.Label>Dashboard</NativeTabs.Trigger.Label>
       </NativeTabs.Trigger>
 
       <NativeTabs.Trigger name="nutrition">
-        <Icon sf="fork.knife" />
-        <Label>Nutrition</Label>
+        <NativeTabs.Trigger.Icon sf="fork.knife" />
+        <NativeTabs.Trigger.Label>Nutrition</NativeTabs.Trigger.Label>
       </NativeTabs.Trigger>
 
       <NativeTabs.Trigger name="weight">
-        <Icon sf={{ default: "scalemass", selected: "scalemass.fill" }} />
-        <Label>Weight</Label>
+        <NativeTabs.Trigger.Icon sf={{ default: "scalemass", selected: "scalemass.fill" }} />
+        <NativeTabs.Trigger.Label>Weight</NativeTabs.Trigger.Label>
       </NativeTabs.Trigger>
 
       <NativeTabs.Trigger name="assistant">
-        <Icon sf="sparkles" />
-        <Label>AI Assistant</Label>
+        <NativeTabs.Trigger.Icon sf="sparkles" />
+        <NativeTabs.Trigger.Label>AI Assistant</NativeTabs.Trigger.Label>
       </NativeTabs.Trigger>
```

The `<NativeTabs …>` opening tag — `backgroundColor`, `shadowColor`, `tintColor`, `iconColor`,
`labelStyle`, `disableTransparentOnScrollEdge` — needs **no change**.

The file's own doc comment (lines 13–24) explicitly describes the SDK 54 shape and the Android
drawable gap; both paragraphs become wrong and must be rewritten in the same edit.

---

## 3. Breaking changes across 55, 56 and 57

Sources: `https://expo.dev/changelog/sdk-55`, `/sdk-56`, `/sdk-57`, plus the tarball reads noted.

### 3.1 New Architecture is mandatory (SDK 55) — **verified**

"you will not be able to use the Legacy Architecture in SDK 55 projects and later", and
`newArchEnabled` was removed from `app.json`. This project's `app.json` does not set
`newArchEnabled` (**verified** by reading the file), so nothing to remove. SDK 54 already defaults
to the New Architecture, so no runtime surprise is expected — **inferred**.

### 3.2 Edge-to-edge mandatory on Android (SDK 55) — **verified**

`edgeToEdgeEnabled` was removed from `app.json`; edge-to-edge is mandatory when targeting Android
16+. Not set in this project's `app.json` — nothing to remove. Several `expo-navigation-bar` /
`expo-status-bar` properties became no-ops. This project only uses `<StatusBar style="light" />`
(`src/app/_layout.tsx:71`, `src/app/(auth)/sign-in.tsx:87`), which is not one of the deprecated
props — **verified** by grep.

### 3.3 `notification` removed from `app.json` (SDK 55) — not used here. **Verified.**

### 3.4 expo-router no longer depends on react-navigation (SDK 56) — **verified in the changelog**

"most code imported directly from `@react-navigation/*` packages will no longer work out of the
box." Grep of `src/`, `server/`, `packages/` finds **zero** `@react-navigation` imports — the only
hit is a comment in `src/app/(tabs)/_layout.tsx:10`. AGENTS.md already banned them. **No impact.**

### 3.5 `expo` no longer depends on `@expo/vector-icons` (SDK 56) — **verified in the changelog**

Grep finds no `@expo/vector-icons` usage in `src/`. **No impact.** If icons are ever wanted for
Android tabs, either add `@expo/vector-icons ^15.0.2` explicitly (it is in the SDK 57 bundled list)
or use the new `md` prop.

### 3.6 `expo/fetch` becomes the default `globalThis.fetch` (SDK 56) — **verified in the changelog**

Client code that calls bare `fetch()` now runs Expo's implementation rather than RN's. No API
change, but it is a behaviour swap in the network layer worth watching if the typed API client
misbehaves after the upgrade. **Unverified** whether it changes anything observable for this project.

### 3.7 expo-file-system `copy()` / `move()` became async (SDK 56); `expo-av` removed (SDK 55)

Neither package is used here (grep: no hits). **No impact.**

### 3.8 expo-router — major version bump, but `typedRoutes` / `reactCompiler` are unchanged

- `expo-router` goes `6.0.24 → 57.0.20`. That is the SDK-aligned renumbering, not six major
  API generations. **Inferred** from the 55/56/57 native-modules comparison in §1.
- `experiments.typedRoutes` and `experiments.reactCompiler` **still live under `experiments`** in
  SDK 57. **Verified** by reading `@expo/config-types@57.0.2`
  `build/ExpoConfig.d.ts:243-244` (`typedRoutes?: boolean;`) and `:255-256`
  (`reactCompiler?: boolean;`). Neither has moved out or been renamed. `app.json` needs no change.
- SDK 55 removed the deprecated `ExpoRequest` / `ExpoResponse` types from expo-router — not used
  here (grep: no hits). **Verified.**

### 3.9 NativeWind — **v4 is probably fine; this is the one real unknown**

- `nativewind` npm `latest` is still **`4.2.6`**; the only 5.x is `5.0.0-preview.4`. **Verified**
  (`npm view nativewind dist-tags`). NativeWind v5 is not released, so "v5 is required" is **not**
  true today.
- `nativewind@4.2.6` was published **2026-06-22**; the SDK 57 native-modules rows were created
  **2026-06-25**. So 4.2.6 predates RN 0.86 stable by days. **Verified** (npm `time`, and the
  `createdAt` fields in the versions API response).
- The GitHub releases page for `react-native-css-interop@0.2.6` (the sole runtime dependency of
  nativewind 4.2.6) says it "Fixed dev hot-reload of new utility classes on **Metro 0.83+**" and
  names **Expo SDK 55/56** explicitly. SDK 57 uses `metro ^0.84.4` (`relatedPackages`), which is
  inside "0.83+". **Verified** that the note exists; **inferred** that it therefore covers 0.84.
- Tailwind stays on **v3**: `react-native-css-interop@0.2.6` peers `tailwindcss: "~3"`
  (**verified**, `npm view`). Do **not** bump to Tailwind 4 — that is a NativeWind v5 requirement
  (v5 preview peers `tailwindcss: ">4.1.11"` and `react-native-css: "^3.0.1"`). `tailwind.config.js`
  with `presets: [require("nativewind/preset")]` stays as-is.
- `babel.config.js` stays as-is: `babel-preset-expo@57.0.11` still accepts the `jsxImportSource`
  option (**verified** — `build/index.d.ts:24` `jsxImportSource?: string;` and
  `build/index.js:150`), and `nativewind/babel` is unchanged. The current
  `babel.config.js` is byte-identical to what nativewind.dev's v4 install guide shows.
- `metro.config.js` stays as-is — the v4 guide's `withNativeWind(config, { input: './global.css' })`
  is exactly what this project has. (v5 renames it to `withNativewind(config)` with no input; not
  applicable.)
- **Unverified and the main risk:** nobody has published a statement that NativeWind 4.2.6 works on
  React Native 0.86 / React 19.2.3. No compatibility table exists on nativewind.dev for v4. If the
  upgrade produces styling failures, the fallback is `nativewind@5.0.0-preview.4` — which drags in
  Tailwind 4, `react-native-css@^3`, a rewritten `global.css`, a `postcss.config.mjs`, and a
  `lightningcss` pin of `1.30.1`. That is a whole branch of its own, not a footnote.

### 3.10 react-native-reanimated 4.1.1 → 4.5.1, react-native-worklets 0.5.1 → 0.10.1

No major bump. **Verified** there are zero direct imports of either in `src/` (grep). They are
present only because expo-router and NativeWind need them, so the blast radius is limited to
NativeWind's animated-class support. `react-native-css-interop@0.2.6` peers
`react-native-reanimated: ">=3.6.2"` (**verified**), so 4.5.1 satisfies it.

### 3.11 react-native-svg 15.12.1 → 15.15.4

Patch-level within 15.x. 8 import sites in `src/`. No breaking change found; **unverified** that
none exists — the changelog posts do not mention it.

### 3.12 react-native-screens 4.16.0 → 4.26.0

This is the package that actually renders Native Tabs. `expo-router@57.0.20` peer-requires
`^4.26.0` (**verified**, tarball `package.json`). plan.md:1285-1286 records that the 4.16-vs-4.18
icon branch in `NativeTabsView.js:220` was written for the old pairing — that reasoning is now
obsolete and the tab bar must be re-verified on the device.

### 3.13 @clerk/expo

`@clerk/expo@4.6.5` peers `expo: ">=54 <58"` — **verified**. Explicitly covers 57. Only
`ClerkProvider`, `useAuth`, `useClerk`, `useSSO` and `@clerk/expo/token-cache` are used
(**verified** by grep); all are stable v4 API. `@clerk/backend ^3.16.1` is server-side and
unaffected by the SDK.

### 3.14 @sentry/react-native ~7.2.0 → ~7.11.0

Minor bump inside 7.x. Peers are permissive (`expo >=49`, `react-native >=0.65`) — **verified**.
The `@sentry/react-native` config plugin block in `app.json` needs no change. **Do not** follow npm
`latest` (8.25.0); the SDK 57 bundled list pins 7.11.

### 3.15 TypeScript 5.9 → 6.0

SDK 57's `relatedPackages` pins `typescript: "~6.0.3"` — **verified**. This is the single largest
non-Expo jump in the upgrade and it touches `tsc --noEmit`, `vitest`, `drizzle-kit` and
`prettier-plugin-tailwindcss` alike. **Unverified** whether TS 6.0 breaks anything in this codebase;
it is a `relatedPackages` recommendation, not a hard requirement, so keeping `~5.9.2` for the first
pass and bumping TypeScript as a separate step is the lower-risk order. `@types/react` must still go
to `~19.2.4` to match React 19.2.3.

### 3.16 `app.json` — no schema changes needed

Every key currently in `app.json` still exists in `@expo/config-types@57.0.2`
(**verified**, `build/ExpoConfig.d.ts`): `userInterfaceStyle` (:58), `ios.icon` as a string or an
`IOSIcons` object or a path to a `.icon` directory (:333 — the existing
`"ios": { "icon": "./assets/expo.icon" }` remains valid), `android.adaptiveIcon` with
`monochromeImage` (:509, :517), `android.predictiveBackGestureEnabled` (:590),
`web.bundler/output/favicon` (:637, :641), and the whole `experiments` block (:207-277).
`expo-splash-screen@57.0.8`'s plugin still takes `backgroundColor`, `image` and `imageWidth`
(**verified**, `plugin/build/types.d.ts:21-29`). The `plugins` array needs no edits.

---

## 4. What will actually break in this project

Ordered by certainty.

1. **`src/app/(tabs)/_layout.tsx` — will not compile.** `import { Icon, Label, NativeTabs } from
   "expo-router/unstable-native-tabs"` fails: `Icon` and `Label` are not exported by
   `expo-router@57.0.20`. **Verified.** This is the *only* source file in the repo with a hard
   compile break. Fix is the diff in §2.
2. **The same file's doc comment (lines 13–24) becomes actively misleading** — it instructs future
   readers to use the SDK 54 shape and states the Android drawable gap. Rewrite in the same edit.
3. **`AGENTS.md` and `plan.md`** — the sections listed in §0. These are agent-facing instructions;
   leaving them saying "pinned to 54" will cause the next session to revert the upgrade.
4. **`router.d.ts` / typed routes will regenerate.** Expect transient `tsc` errors on `href` values
   until Metro rewrites it — this is the known
   `~/.claude/.../memory/expo-typedroutes-stale.md` failure mode, not a real error.
5. **`src/components/nativewind-interop.ts`** — `cssInterop(LinearGradient, …)` and
   `cssInterop(Image, …)`. Not a compile break (NativeWind's API is unchanged), but it is the
   NativeWind surface most likely to regress silently at runtime if 4.2.6 does not fully understand
   RN 0.86. This is the memory entry "verify on device, not the web preview" — check the sign-in
   gradient and the images on the phone specifically.
6. **The Native Tabs on-device verification is void.** plan.md:1281-1291 verified the bar against
   `react-native-screens` 4.16.0 and `expo-router` 6.0.24. Both change. Re-verify on the iPhone
   before ticking anything.
7. **Nothing else in `src/` imports a changed API.** Full inventory of third-party imports
   (**verified** by grep across `src/`, `server/`, `packages/`, `scripts/`): `expo-router` (11 —
   `Redirect`, `Stack`, `useRouter`, `useLocalSearchParams`), `react-native-svg` (8),
   `react-native-safe-area-context` (8 — `SafeAreaProvider`, `useSafeAreaInsets`), `@clerk/expo` (7),
   `expo-image` (3 — `Image`), `expo-status-bar` (2), `expo-linear-gradient` (2), `nativewind` (1 —
   `cssInterop`), `expo-splash-screen` (1), `expo-font` (1 — `useFonts`), `expo-crypto` (1 —
   `getRandomBytes`), `@sentry/react-native` (1), `@expo-google-fonts/*` (2). Every one of these is
   stable API across 55/56/57 as far as the three changelogs go.
8. **`babel.config.js`, `metro.config.js`, `tailwind.config.js`, `app.json` — no changes required.**
   **Verified** (§3.9, §3.16).

### Residual unknowns, stated as unknowns

- Whether the App Store Expo Go binary is on 57. Only the device can answer.
- Whether NativeWind 4.2.6 renders correctly on RN 0.86 / React 19.2.3. No primary source states it
  either way. This is the thing to watch on device first.
- Whether TypeScript 6.0 typechecks this codebase clean.
- Whether `react-native-svg` 15.15.4 changed anything the charts rely on.
- Whether the SDK 57 Expo Go binary contains `@expo/ui` and `expo-glass-effect`, which
  `expo-router@57.0.20` now pulls in unconditionally. They are in the SDK 57 bundled-native-modules
  list, which strongly implies yes, but only the device proves it.
