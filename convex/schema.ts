import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // טוקן הגישה לדרייב (נשמר אחרי ההתחברות ל-Google)
  tokens: defineTable({ refreshToken: v.string() }),
  // מזהים חד-פעמיים להתחברות ל-Google
  oauthStates: defineTable({ state: v.string() }).index("by_state", ["state"]),
});
