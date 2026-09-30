import { trpc } from "@/lib/trpc";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import "./index.css";
import "./cardora.css";
import "./cardora-responsive-theme.css";

const queryClient = new QueryClient();

let csrfTokenPromise: Promise<string> | null = null;
async function getCsrfToken(): Promise<string> {
  if (!csrfTokenPromise) {
    csrfTokenPromise = globalThis.fetch("/api/auth/csrf", { credentials: "include", cache: "no-store" })
      .then(async response => {
        if (!response.ok) throw new Error("Could not initialize request protection.");
        const body = await response.json() as { token?: unknown };
        if (typeof body.token !== "string") throw new Error("Could not initialize request protection.");
        return body.token;
      })
      .catch(error => { csrfTokenPromise = null; throw error; });
  }
  return csrfTokenPromise;
}

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      fetch(input, init) {
        return getCsrfToken().then(token => {
          const headers = new Headers(init?.headers);
          headers.set("x-cardora-csrf", token);
          return globalThis.fetch(input, { ...(init ?? {}), headers, credentials: "include" });
        });
      },
    }),
  ],
});

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </trpc.Provider>
);
