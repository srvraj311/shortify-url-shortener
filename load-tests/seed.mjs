// Seed N anonymous short codes and print them (one per line).
//   BASE=https://<preview> N=500 node load-tests/seed.mjs > load-tests/results/codes.txt
const BASE = process.env.BASE || "http://localhost:3000";
const N = Number(process.env.N || 100);

for (let i = 0; i < N; i++) {
  const res = await fetch(`${BASE}/api/v1/urls`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url: `https://example.com/seed/${i}` }),
  });
  if (!res.ok) {
    process.stderr.write(`seed ${i}: ${res.status}\n`);
    continue;
  }
  const { url } = await res.json();
  process.stdout.write(url.shortCode + "\n");
}
