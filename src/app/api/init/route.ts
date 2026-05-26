// This API route is called automatically to initialize the app
export async function GET(): Promise<Response> {
  return new Response("Initialized", { status: 200 });
}
