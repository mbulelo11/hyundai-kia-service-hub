"use node";

import { Buffer } from "buffer";
import { action } from "./_generated/server";
import { v } from "convex/values";

export const extractPdfTextFromBase64 = action({
  args: {
    pdfBase64: v.string(),
  },
  returns: v.string(),
  handler: async (_ctx, args) => {
    const text = Buffer.from(args.pdfBase64, "base64").toString("utf8").replace(/\0/g, "").trim();
    if (!text) {
      throw new Error("PDF text extraction is currently unavailable in this deployment.");
    }
    return text;
  },
});