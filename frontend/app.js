const API_BASE = "http://localhost:3000";

document.getElementById("payment-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;
  const amount = form.amount.value;
  const payee = form.payee.value;

  const res = await fetch(`${API_BASE}/create-payment`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ amount, payee })
  });
  const data = await res.json();
  console.log("create-payment response", data);

  if (!data.success) {
    document.getElementById("result").innerText = "Error: " + data.error;
    return;
  }

  const opUrl = data.resource_url || data.op?.json?.id;
  document.getElementById("result").innerText =
    `Pago creado. URL recurso: ${opUrl}`;

  // Polling
  let count = 0;
  const interval = setInterval(async () => {
    count++;
    const encoded = encodeURIComponent(opUrl);
    const r = await fetch(`${API_BASE}/status/${encoded}`);
    const s = await r.json();
    console.log("status", s);

    document.getElementById("status").innerText =
      `Polling #${count}\n` + JSON.stringify(s.op?.json, null, 2);

    if (s.op?.json?.status === "completed" || count >= 20) {
      clearInterval(interval);
    }
  }, 3000);
});
