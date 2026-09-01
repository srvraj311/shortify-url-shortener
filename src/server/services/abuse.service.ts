import { Types } from "mongoose";
import { AbuseReport, Url } from "@/lib/db/models";
import { AppError } from "@/lib/errors";
import { emitEvent } from "./events.service";
import { audit } from "./audit.service";
import { incr } from "@/lib/metrics";

/** Abuse reporting (Plan §38, §54). */

export async function reportUrl(input: {
  urlId: string;
  reason: "SPAM" | "MALWARE" | "PHISHING" | "ABUSE" | "OTHER";
  detail?: string | null;
  reporterId?: string | null;
  reporterIpHash?: string | null;
}): Promise<{ id: string }> {
  if (!Types.ObjectId.isValid(input.urlId)) throw new AppError("URL_NOT_FOUND", "Short URL does not exist");
  const url = await Url.findById(input.urlId).select("shortCode");
  if (!url) throw new AppError("URL_NOT_FOUND", "Short URL does not exist");

  // One open report per reporter per URL.
  const dupFilter = input.reporterId
    ? { urlId: url._id, reporterId: new Types.ObjectId(input.reporterId), status: "OPEN" }
    : { urlId: url._id, reporterIpHash: input.reporterIpHash, status: "OPEN" };
  const existing = await AbuseReport.findOne(dupFilter);
  if (existing) return { id: String(existing._id) };

  const doc = await AbuseReport.create({
    urlId: url._id,
    shortCode: url.shortCode,
    reporterId: input.reporterId ? new Types.ObjectId(input.reporterId) : null,
    reporterIpHash: input.reporterIpHash ?? null,
    reason: input.reason,
    detail: input.detail ?? null,
  });
  incr("abuse.reported");
  await emitEvent("ABUSE_REPORTED", { urlId: String(url._id), shortCode: url.shortCode, reason: input.reason });
  await audit({
    actorId: input.reporterId ?? null,
    actorType: input.reporterId ? "USER" : "ANON",
    action: "REPORT_URL",
    resourceType: "url",
    resourceId: String(url._id),
    metadata: { reason: input.reason },
  });
  return { id: String(doc._id) };
}

export async function listReports(status: string | null, limit: number) {
  const filter = status ? { status } : {};
  const rows = await AbuseReport.find(filter).sort({ createdAt: -1 }).limit(limit);
  return rows.map((r) => ({
    id: String(r._id),
    urlId: String(r.urlId),
    shortCode: r.shortCode,
    reason: r.reason,
    detail: r.detail,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
    resolvedAt: r.resolvedAt ? r.resolvedAt.toISOString() : null,
  }));
}

export async function resolveReport(
  reportId: string,
  adminId: string,
  action: "ACTIONED" | "DISMISSED",
): Promise<void> {
  if (!Types.ObjectId.isValid(reportId)) throw new AppError("NOT_FOUND", "Report not found");
  const res = await AbuseReport.updateOne(
    { _id: new Types.ObjectId(reportId), status: { $in: ["OPEN", "REVIEWING"] } },
    { $set: { status: action, resolvedAt: new Date(), resolvedBy: adminId } },
  );
  if (res.matchedCount === 0) throw new AppError("NOT_FOUND", "Report not found or already resolved");
  await audit({ actorId: adminId, actorType: "ADMIN", action: `ABUSE_${action}`, resourceType: "abuse_report", resourceId: reportId });
}
