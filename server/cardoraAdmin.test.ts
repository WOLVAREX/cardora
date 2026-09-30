import { describe, expect, it } from "vitest";
import { adminProcedure, router } from "./_core/trpc";

const accessProbe = router({ read: adminProcedure.query(({ ctx }) => ({ id: ctx.user.id, role: ctx.user.role })) });

function caller(user: unknown) {
  return accessProbe.createCaller({ req: {} as never, res: { setHeader: () => undefined } as never, user: user as never });
}

describe("Cardora admin route protection", () => {
  it("denies unauthenticated visitors", async () => {
    await expect(caller(null).read()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("denies authenticated regular owners", async () => {
    await expect(caller({ id: 42, role: "user" }).read()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows the explicit database administrator role", async () => {
    await expect(caller({ id: 7, role: "admin" }).read()).resolves.toEqual({ id: 7, role: "admin" });
  });
});
