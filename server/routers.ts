import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type { User, PublicUser } from "../drizzle/schema";
import { signInWithEmail, signOut, signUpWithEmail } from "./emailAuth";
import { systemRouter } from "./_core/systemRouter";
import { onboardingProcedure, publicProcedure, router } from "./_core/trpc";
import { emailDeliveryConfigured, sendEmailVerification, verifyEmailToken } from "./emailVerification";
import { normalizePhone } from "./cardora";
import { cardoraRouter } from "./cardoraRouter";
import { adminRouter } from "./adminRouter";

function safeUser(user: User): PublicUser;
function safeUser(user: null): null;
function safeUser(user: User | null): PublicUser | null;
function safeUser(user: User | null): PublicUser | null {
  if (!user) return null;
  return { id: user.id, name: user.name, email: user.email, role: user.role, phoneE164: user.phoneE164, phoneCountryCode: user.phoneCountryCode, phoneVerifiedAt: user.phoneVerifiedAt, emailVerifiedAt: user.emailVerifiedAt };
}

const emailSchema = z.string().trim().email().max(320);
const passwordSchema = z.string().min(12, "Use at least 12 characters.").max(1024);

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(({ ctx }) => {
      ctx.res.setHeader("Cache-Control", "private, no-store");
      return safeUser(ctx.user);
    }),
    signUp: publicProcedure.input(z.object({
      name: z.string().trim().min(1).max(120),
      email: emailSchema,
      password: passwordSchema,
      phone: z.string().min(6).max(40),
    })).mutation(async ({ ctx, input }) => {
      let countryCode: string;
      try { countryCode = normalizePhone(input.phone).countryCode; }
      catch { throw new TRPCError({ code: "BAD_REQUEST", message: "Enter a valid international phone number, including its country calling code." }); }
      if (countryCode !== "KE" && !emailDeliveryConfigured()) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Email verification is not configured yet. Please contact Cardora support." });
      }
      const user = await signUpWithEmail(input, ctx.req, ctx.res);
      if (countryCode !== "KE") await sendEmailVerification(user);
      ctx.res.setHeader("Cache-Control", "private, no-store");
      return safeUser(user);
    }),
    resendEmailVerification: onboardingProcedure.mutation(async ({ ctx }) => {
      if (ctx.user.phoneCountryCode === "KE") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Kenyan accounts verify using their phone number." });
      if (ctx.user.emailVerifiedAt) return { sent: false, message: "Your email is already verified." };
      await sendEmailVerification(ctx.user);
      return { sent: true, message: `Verification email sent to ${ctx.user.email}.` };
    }),
    verifyEmail: publicProcedure.input(z.object({ token: z.string().min(40).max(50) })).mutation(async ({ ctx, input }) => {
      const user = await verifyEmailToken(input.token, ctx.req, ctx.res);
      ctx.res.setHeader("Cache-Control", "private, no-store");
      return safeUser(user);
    }),
    signIn: publicProcedure.input(z.object({
      email: emailSchema,
      password: z.string().min(1).max(1024),
    })).mutation(async ({ ctx, input }) => {
      const user = await signInWithEmail(input, ctx.req, ctx.res);
      ctx.res.setHeader("Cache-Control", "private, no-store");
      return safeUser(user);
    }),
    logout: publicProcedure.mutation(async ({ ctx }) => {
      try {
        await signOut(ctx.req, ctx.res);
      } catch {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Could not end this session. Please try again." });
      }
      return { success: true } as const;
    }),
  }),
  cardora: cardoraRouter,
  admin: adminRouter,
});

export type AppRouter = typeof appRouter;
