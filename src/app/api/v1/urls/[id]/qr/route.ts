import QRCode from "qrcode";
import { route } from "@/server/http/handler";
import { requireAuth } from "@/server/http/auth";
import { getUrlForOwner, toDto } from "@/server/services/url.service";
import { getRequestId } from "@/lib/request-context";

// GET /api/v1/urls/:id/qr(.png) — QR code for the short URL (Plan §53)
export const GET = route(
  async ({ req, params }) => {
    const auth = await requireAuth(req);
    const doc = await getUrlForOwner(String(params.id), auth.userId, auth.role === "ADMIN");
    const shortUrl = toDto(doc).shortUrl;

    const png = await QRCode.toBuffer(shortUrl, {
      errorCorrectionLevel: "M",
      margin: 2,
      width: 320,
    });

    return new Response(new Uint8Array(png), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=86400",
        "X-Request-Id": getRequestId() ?? "",
      },
    });
  },
  { name: "urls.qr" },
);
