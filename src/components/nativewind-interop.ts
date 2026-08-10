import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { cssInterop } from "nativewind";

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
