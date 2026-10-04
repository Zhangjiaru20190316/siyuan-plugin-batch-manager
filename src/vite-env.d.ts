/// <reference types="svelte" />
/// <reference types="vite/client" />

declare module "*.svelte" {
    import type {SvelteComponent} from "svelte";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    export default SvelteComponent as new (options: {target: Element; props?: any}) => SvelteComponent;
}
