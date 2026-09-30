import express, { type Express } from "express";
import fs from "fs";
import { type Server } from "http";
import { nanoid } from "nanoid";
import path from "path";
import { createServer as createViteServer } from "vite";
import viteConfig from "../../vite.config";
import { publicCollectionBySlug } from "../cardoraDb";
import { withCollectionMetadata } from "../cardoraSeo";

export async function setupVite(app: Express, server: Server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    server: serverOptions,
    appType: "custom",
  });

  app.get("/c/:slug", async (req, res, next) => {
    try {
      const clientTemplate = path.resolve(import.meta.dirname, "../..", "client", "index.html");
      const template = await fs.promises.readFile(clientTemplate, "utf-8");
      const collection = await publicCollectionBySlug(req.params.slug);
      const page = await vite.transformIndexHtml(req.originalUrl, withCollectionMetadata(template, collection));
      res.status(200).set({ "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store" }).end(page);
    } catch (error) { next(error); }
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "../..",
        "client",
        "index.html"
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  const distPath =
    process.env.NODE_ENV === "development"
      ? path.resolve(import.meta.dirname, "../..", "dist", "public")
      : path.resolve(import.meta.dirname, "public");
  if (!fs.existsSync(distPath)) {
    console.error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }

  app.get("/c/:slug", async (req, res, next) => {
    try {
      const template = await fs.promises.readFile(path.resolve(distPath, "index.html"), "utf-8");
      const collection = await publicCollectionBySlug(req.params.slug);
      res.status(200).set({ "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store" })
        .send(withCollectionMetadata(template, collection));
    } catch (error) { next(error); }
  });

  app.use(express.static(distPath));

  // fall through to index.html if the file doesn't exist
  app.use("*", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
