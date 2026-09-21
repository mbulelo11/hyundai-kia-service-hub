/**
 * Client-safe Convex API object.
 * 
 * This recreates the same Proxy-based function reference system that
 * convex/server's `anyApi` uses, but without importing convex/server
 * (which isn't available on the client in the a0 runtime).
 * 
 * Usage: api.moduleName.functionName -> FunctionReference
 */
const fnName = Symbol.for("functionName");

function createApi(pathParts: string[] = []): any {
  const handler: ProxyHandler<object> = {
    get(_, prop: string | symbol) {
      if (typeof prop === "string") {
        return createApi([...pathParts, prop]);
      } else if (prop === fnName) {
        if (pathParts.length < 2) {
          const found = ["api", ...pathParts].join(".");
          throw new Error(
            `API path is expected to be of the form \`api.moduleName.functionName\`. Found: \`${found}\``
          );
        }
        const path = pathParts.slice(0, -1).join("/");
        const exportName = pathParts[pathParts.length - 1];
        return exportName === "default" ? path : `${path}:${exportName}`;
      } else if (prop === Symbol.toStringTag) {
        return "FunctionReference";
      }
      return undefined;
    },
  };
  return new Proxy({}, handler);
}

export const api: any = createApi();