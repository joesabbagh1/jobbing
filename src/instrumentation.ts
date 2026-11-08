// Runs once when the Next.js server starts. Node-only code lives in a separate
// module so it isn't bundled for the edge runtime.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation-node");
  }
}
