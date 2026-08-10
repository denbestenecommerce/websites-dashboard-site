// Websites Dashboard — opslagfunctie
// Leest/schrijft de dashboarddata als JSON-bestand in een GitHub-repo (de "database").
// Geen npm-afhankelijkheden nodig — gebruikt alleen de ingebouwde fetch().

const GITHUB_API = "https://api.github.com";

function envOrThrow(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Ontbrekende omgevingsvariabele: ${name}`);
  return v;
}

function contentsUrl() {
  const repo = envOrThrow("GITHUB_REPO"); // bijv. "jouwgebruikersnaam/websites-dashboard-data"
  const path = process.env.GITHUB_PATH || "dashboard.json";
  const branch = process.env.GITHUB_BRANCH || "main";
  return `${GITHUB_API}/repos/${repo}/contents/${path}?ref=${branch}`;
}

function githubHeaders() {
  const token = envOrThrow("GITHUB_TOKEN");
  return {
    Authorization: `Bearer ${token}`,
    "User-Agent": "websites-dashboard-function",
    Accept: "application/vnd.github+json",
  };
}

function checkPassword(req) {
  const expected = process.env.DASHBOARD_PASSWORD;
  if (!expected) return true; // geen wachtwoord ingesteld: open (niet aanbevolen)
  const given = req.headers.get("x-dashboard-password") || "";
  return given === expected;
}

export default async (req) => {
  if (!checkPassword(req)) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    if (req.method === "GET") {
      const res = await fetch(contentsUrl(), { headers: githubHeaders() });
      if (!res.ok) {
        const detail = await res.text();
        return new Response(JSON.stringify({ error: "kon data niet laden", detail }), {
          status: 502,
          headers: { "Content-Type": "application/json" },
        });
      }
      const json = await res.json();
      const content = Buffer.from(json.content, "base64").toString("utf-8");
      return new Response(content, {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (req.method === "POST") {
      const body = await req.json();
      const items = body && body.data;
      if (!Array.isArray(items)) {
        return new Response(JSON.stringify({ error: "ongeldige data" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      // huidige sha ophalen (nodig om het bestand te mogen overschrijven)
      const getRes = await fetch(contentsUrl(), { headers: githubHeaders() });
      if (!getRes.ok) {
        const detail = await getRes.text();
        return new Response(JSON.stringify({ error: "kon huidige data niet ophalen", detail }), {
          status: 502,
          headers: { "Content-Type": "application/json" },
        });
      }
      const current = await getRes.json();

      const repo = envOrThrow("GITHUB_REPO");
      const path = process.env.GITHUB_PATH || "dashboard.json";
      const branch = process.env.GITHUB_BRANCH || "main";
      const newContent = Buffer.from(JSON.stringify(items, null, 2)).toString("base64");

      const putRes = await fetch(`${GITHUB_API}/repos/${repo}/contents/${path}`, {
        method: "PUT",
        headers: { ...githubHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          message: `Dashboard bijgewerkt — ${new Date().toISOString()}`,
          content: newContent,
          sha: current.sha,
          branch,
        }),
      });

      if (!putRes.ok) {
        const detail = await putRes.text();
        return new Response(JSON.stringify({ error: "opslaan mislukt", detail }), {
          status: 502,
          headers: { "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response("Method not allowed", { status: 405 });
  } catch (err) {
    return new Response(JSON.stringify({ error: "serverfout", detail: String(err && err.message || err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

export const config = { path: "/api/data" };
