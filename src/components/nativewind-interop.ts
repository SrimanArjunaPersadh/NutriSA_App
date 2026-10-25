import { CameraView } from "expo-camera";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { cssInterop } from "nativewind";
import { GestureHandlerRootView } from "react-native-gesture-handler";

/**
 * NativeWind only maps `className` -> `style` automatically for React Native's
 * own components. Third-party ones have to be registered, otherwise the
 * className is dropped and the component lays out at zero height — which for
 * LinearGradient also collapses its gradient to a horizontal one, because the
 * web build derives the angle from the measured box.
 *
 * Import this module once, before anything renders (see src/app/_layout.tsx).
 */
cssInterop(LinearGradient, { className: "style" });

/**
 * Same trap, different component: `expo-image`'s Image is not React Native's
 * Image, so react-native-css-interop's built-in registration does not cover it.
 * Unregistered, the auth background silently rendered at zero size on device
 * while still looking correct on web — expo-image forwards className to the DOM
 * there, so the CSS class applies without any interop.
 */
cssInterop(Image, { className: "style" });

/**
 * And a third: the barcode scanner's `CameraView` (food logger, 2026-10-19).
 * Registered before it ever reached the phone, because the failure is the same
 * one twice over — unregistered, `className="flex-1"` is dropped and the
 * preview lays out at zero height, which on the device looks exactly like a
 * camera that never started.
 */
cssInterop(CameraView, { className: "style" });

/**
 * And a fourth: the root `GestureHandlerRootView` (2026-10-20, for swipe to
 * delete). It wraps the whole app with `className="flex-1"`; unregistered, the
 * class would be dropped and the root would lay out at zero height — the whole
 * app blank, not one component.
 */
cssInterop(GestureHandlerRootView, { className: "style" });
