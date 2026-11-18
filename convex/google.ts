import { internalMutationGeneric, internalQueryGeneric, makeFunctionReference } from "convex/server";
import { v } from "convex/values";

export const getToken = internalQueryGeneric({
  args: {},
  handler: async (ctx) => (await ctx.db.query("tokens").first())?.refreshToken ?? null,
});

export const saveToken = internalMutationGeneric({
  args: { refreshToken: v.string() },
  handler: async (ctx, { refreshToken }) => {
    for (const t of await ctx.db.query("tokens").collect()) await ctx.db.delete(t._id);
    await ctx.db.insert("tokens", { refreshToken });
  },
});

export const addState = internalMutationGeneric({
  args: { state: v.string() },
  handler: async (ctx, { state }) => {
    await ctx.db.insert("oauthStates", { state });
  },
});

export const consumeState = internalMutationGeneric({
  args: { state: v.string() },
  handler: async (ctx, { state }) => {
    const row = await ctx.db
      .query("oauthStates")
      .withIndex("by_state", (q) => q.eq("state", state))
      .first();
    if (!row) return false;
    await ctx.db.delete(row._id);
    return true;
  },
});

export const refs = {
  getToken: makeFunctionReference<"query", Record<string, never>, string | null>("google:getToken"),
  saveToken: makeFunctionReference<"mutation", { refreshToken: string }, null>("google:saveToken"),
  addState: makeFunctionReference<"mutation", { state: string }, null>("google:addState"),
  consumeState: makeFunctionReference<"mutation", { state: string }, boolean>("google:consumeState"),
};
