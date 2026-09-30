import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import { requestHasValidCsrf } from "./csrf";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
const csrfProtection = t.middleware(({ ctx, type, next }) => {
  if (type === "mutation" && !requestHasValidCsrf(ctx.req)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "This request could not be verified. Refresh the page and try again." });
  }
  return next();
});
const baseProcedure = t.procedure.use(csrfProtection);
export const publicProcedure = baseProcedure;

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  ctx.res.setHeader("Cache-Control", "private, no-store");
  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const onboardingProcedure = baseProcedure.use(requireUser);

const requireVerifiedAccount = t.middleware(({ ctx, next }) => {
  const user = ctx.user;
  if (!user) throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  const verified = user.phoneCountryCode === "KE" ? Boolean(user.phoneVerifiedAt) : Boolean(user.emailVerifiedAt);
  if (!user.phoneE164 || !verified) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Complete account verification before using Cardora." });
  }
  return next();
});
export const protectedProcedure = onboardingProcedure.use(requireVerifiedAccount);

export const adminProcedure = baseProcedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== 'admin') {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }
    const verified = ctx.user.phoneCountryCode === "KE" ? Boolean(ctx.user.phoneVerifiedAt) : Boolean(ctx.user.emailVerifiedAt);
    if (!ctx.user.phoneE164 || !verified) throw new TRPCError({ code: "FORBIDDEN", message: "Complete account verification before using Cardora." });

    ctx.res.setHeader("Cache-Control", "private, no-store");
    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);
