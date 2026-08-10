// Metro resolves static image imports to an opaque asset id. Neither `expo/types`
// nor React Native's own types declare these modules, so `import bg from "./x.png"`
// fails to typecheck without this. `require()` sidesteps it by returning `any`.
declare module "*.png" {
  const asset: number;
  export default asset;
}

declare module "*.jpg" {
  const asset: number;
  export default asset;
}

declare module "*.jpeg" {
  const asset: number;
  export default asset;
}

declare module "*.gif" {
  const asset: number;
  export default asset;
}

declare module "*.webp" {
  const asset: number;
  export default asset;
}
