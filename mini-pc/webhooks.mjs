import setup from "../api/webhook/setup.ts";
export async function maintainWebhooks(config) {
  const origin = new URL(
    config.OURA_PUBLIC_APP_URL ||
      "https://oura-community-leaderboard.vercel.app",
  );
  let status = 200;
  let result;
  const response = {
    status(value) {
      status = value;
      return this;
    },
    setHeader() {
      return this;
    },
    send(value) {
      result = typeof value === "string" ? JSON.parse(value) : value;
      return this;
    },
    json(value) {
      result = value;
      return this;
    },
  };
  await setup(
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.CRON_SECRET}`,
        host: origin.host,
        "x-forwarded-host": origin.host,
        "x-forwarded-proto": origin.protocol.slice(0, -1),
      },
      query: {},
    },
    response,
  );
  if (status >= 400) throw new Error(`webhook_maintenance_${status}`);
  return result;
}
