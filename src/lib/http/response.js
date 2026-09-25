// HTTP Response helpers shared by API routes; class name kept from the pre-Hono era.
// Standards-compliant: returns native Web API Response.

export class HttpNextResponse extends Response {
  static json(body, init = {}) {
    return Response.json(body, init);
  }

  static redirect(url, status = 307) {
    const s = typeof status === "number" ? status : 307;
    return Response.redirect(url, s);
  }

  static next() {
    return new Response(null, {
      headers: { "x-middleware-next": "1" },
    });
  }
}

export const NextResponse = HttpNextResponse;
export default HttpNextResponse;
