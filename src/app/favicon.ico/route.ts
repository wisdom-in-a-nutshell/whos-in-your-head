export const runtime = "nodejs";

const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="12" fill="#f8f4ee"/>
  <path d="M12 20h40v8H12zM12 36h28v8H12z" fill="#16110f"/>
  <circle cx="48" cy="40" r="6" fill="#d93631"/>
</svg>`;

export function GET() {
  return new Response(faviconSvg, {
    headers: {
      "Cache-Control": "public, max-age=86400",
      "Content-Type": "image/svg+xml"
    }
  });
}
