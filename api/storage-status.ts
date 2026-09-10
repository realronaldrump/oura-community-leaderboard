export default async function handler(req: any, res: any) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET")
    return res.status(405).json({ error: "method_not_allowed" });
  const origin = process.env.OURA_MINI_PC_URL;
  if (!origin)
    return res.status(200).json({ backend: "firestore", cutover: false });
  try {
    const response = await fetch(new URL("/private/status", origin), {
      headers: {
        Authorization: `Bearer ${process.env.OURA_MINI_PC_TOKEN || ""}`,
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error("backend_not_verified");
    const data = await response.json();
    return res
      .status(200)
      .json({
        backend: "mini-pc",
        cutover: Boolean(data.active),
        build: data.build,
        mode: data.mode,
      });
  } catch {
    return res
      .status(503)
      .json({
        backend: "mini-pc",
        cutover: false,
        error: "backend_unavailable",
      });
  }
}
