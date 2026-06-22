const BACKEND_URL = process.env.TEST_BACKEND_URL || "http://backend:5000";
const FRONTEND_URL = process.env.TEST_FRONTEND_URL || "http://frontend:3000";

const MAX_ATTEMPTS = Number(process.env.TEST_MAX_ATTEMPTS || 60);
const WAIT_MS = Number(process.env.TEST_WAIT_MS || 2000);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function waitForUrl(url, label) {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        console.log(`[tests] ${label} reachable on attempt ${attempt}`);
        return;
      }
      console.log(`[tests] ${label} not ready yet (status ${response.status}, attempt ${attempt})`);
    } catch (err) {
      console.log(`[tests] ${label} not reachable yet (attempt ${attempt}): ${err.message}`);
    }
    await sleep(WAIT_MS);
  }

  throw new Error(`${label} did not become reachable in time: ${url}`);
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let body = null;

  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text };
    }
  }

  return { response, body };
}

async function run() {
  console.log("[tests] Starting compose smoke tests");

  await waitForUrl(`${BACKEND_URL}/api/health`, "backend");
  await waitForUrl(`${FRONTEND_URL}/`, "frontend");

  const health = await fetchJson(`${BACKEND_URL}/api/health`);
  assert(health.response.ok, `Health endpoint failed with status ${health.response.status}`);
  assert(
    health.body && typeof health.body.message === "string" && health.body.message.includes("running"),
    "Health response payload is invalid"
  );
  console.log("[tests] Backend health check passed");

  const login = await fetchJson(`${BACKEND_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      identifier: "researcher",
      password: "User123!Change"
    })
  });

  assert(login.response.ok, `Login failed with status ${login.response.status}`);
  assert(login.body && login.body.token, "Login response missing token");
  console.log("[tests] Auth login check passed");

  const datasets = await fetchJson(`${BACKEND_URL}/api/datasets`, {
    headers: {
      Authorization: `Bearer ${login.body.token}`
    }
  });

  assert(datasets.response.ok, `Datasets endpoint failed with status ${datasets.response.status}`);
  assert(Array.isArray(datasets.body?.data), "Datasets response missing data array");
  assert(datasets.body.data.length > 0, "Expected at least one accessible dataset");
  console.log("[tests] Protected datasets check passed");

  const frontendHome = await fetch(`${FRONTEND_URL}/`);
  const frontendHtml = await frontendHome.text();
  assert(frontendHome.ok, `Frontend root failed with status ${frontendHome.status}`);
  assert(frontendHtml.includes("<html") || frontendHtml.includes("id=\"root\""), "Frontend HTML payload invalid");
  console.log("[tests] Frontend availability check passed");

  console.log("[tests] All smoke tests passed");
}

run().catch((err) => {
  console.error("[tests] Smoke tests failed:", err.message);
  process.exit(1);
});
