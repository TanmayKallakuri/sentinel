"use client";

import { useState } from "react";

export default function Home() {
  const [domain, setDomain] = useState("");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState("");

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setResult("");
    try {
      const response = await fetch("/api/scan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ domain }),
      });
      const text = await response.text();
      setResult(text);
    } catch {
      setResult("The request could not be sent. Check that the server is running and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main style={{ maxWidth: "42rem", margin: "0 auto", padding: "3rem 1.5rem" }}>
      <h1>Sentinel</h1>
      <p>
        A passive vendor security posture review. Sentinel reads only public data: pages a visitor
        can already load, a standard TLS handshake, and public DNS records. It never logs in, probes,
        or sends anything a normal reader would not.
      </p>
      <form onSubmit={onSubmit}>
        <label htmlFor="domain">Vendor domain</label>
        <input
          id="domain"
          name="domain"
          value={domain}
          onChange={(event) => setDomain(event.target.value)}
          placeholder="acme.com"
          autoComplete="off"
          style={{ display: "block", width: "100%", padding: "0.5rem", margin: "0.5rem 0" }}
        />
        <button type="submit" disabled={pending}>
          {pending ? "Scanning" : "Scan"}
        </button>
      </form>
      {result ? <pre style={{ whiteSpace: "pre-wrap", marginTop: "1.5rem" }}>{result}</pre> : null}
    </main>
  );
}
