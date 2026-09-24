export class NextResponse extends Response {
  static json(body, init = {}) {
    return Response.json(body, init);
  }

  static redirect(url, status = 307) {
    const statusNum = typeof status === "number" ? status : 307;
    return Response.redirect(url, statusNum);
  }

  static next() {
    return new Response(null, {
      headers: { "x-middleware-next": "1" },
    });
  }
}

export class NextRequest extends Request {
  constructor(input, init) {
    super(input, init);
    const urlObj = new URL(this.url);
    this.nextUrl = urlObj;
  }
}

export default {
  NextResponse,
  NextRequest,
};
