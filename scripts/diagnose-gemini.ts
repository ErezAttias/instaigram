/**
 * Gemini Connectivity Diagnosis
 *
 * Tests transport-level connectivity to the Gemini API endpoint.
 * Distinguishes: DNS, TLS, connection, auth, HTTP, timeout errors.
 */

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { resolve } from 'dns/promises';
import https from 'https';

// ─── 1. Environment Check ───────────────────────────────────────

function checkEnv() {
  console.log('1. ENVIRONMENT VARIABLES');
  console.log('─'.repeat(50));

  const key = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_IMAGE_MODEL;
  const modelFlash = process.env.GEMINI_IMAGE_MODEL_FLASH;
  const modelPro = process.env.GEMINI_IMAGE_MODEL_PRO;
  const baseUrl = process.env.GEMINI_BASE_URL;

  console.log(`  GEMINI_API_KEY:          ${key ? `${key.slice(0, 6)}...${key.slice(-4)} (${key.length} chars)` : '❌ MISSING'}`);
  console.log(`  GEMINI_IMAGE_MODEL:      ${model ?? '(not set — using defaults)'}`);
  console.log(`  GEMINI_IMAGE_MODEL_FLASH:${modelFlash ?? '(not set)'}`);
  console.log(`  GEMINI_IMAGE_MODEL_PRO:  ${modelPro ?? '(not set)'}`);
  console.log(`  GEMINI_BASE_URL:         ${baseUrl ?? '(not set — using default)'}`);

  const effectiveBase = baseUrl ?? 'https://generativelanguage.googleapis.com/v1beta';
  const effectiveModel = model ?? modelFlash ?? 'gemini-3.1-flash-image-preview';
  const fullUrl = `${effectiveBase}/models/${effectiveModel}:generateContent`;

  console.log();
  console.log(`  Effective base URL:  ${effectiveBase}`);
  console.log(`  Effective model:     ${effectiveModel}`);
  console.log(`  Full endpoint:       ${fullUrl}`);
  console.log(`  API key in URL:      NO (sent via x-goog-api-key header)`);

  return { key, effectiveBase, effectiveModel, fullUrl };
}

// ─── 2. DNS Resolution ──────────────────────────────────────────

async function checkDns(hostname: string) {
  console.log('\n2. DNS RESOLUTION');
  console.log('─'.repeat(50));
  console.log(`  Host: ${hostname}`);

  try {
    const addresses = await resolve(hostname);
    console.log(`  ✓ Resolved to: ${addresses.join(', ')}`);
    return { ok: true, addresses };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const code = (err as any)?.code;
    console.log(`  ✗ DNS failed: ${code ?? ''} ${msg}`);
    return { ok: false, error: code ?? 'DNS_ERROR' };
  }
}

// ─── 3. TLS / HTTPS Connectivity ────────────────────────────────

function checkHttps(hostname: string): Promise<{ ok: boolean; statusCode?: number; error?: string }> {
  console.log('\n3. HTTPS CONNECTIVITY');
  console.log('─'.repeat(50));
  console.log(`  Testing: HEAD https://${hostname}/`);

  return new Promise((res) => {
    const req = https.request(
      { hostname, port: 443, path: '/', method: 'HEAD', timeout: 10000 },
      (response) => {
        console.log(`  ✓ Connected — HTTP ${response.statusCode}`);
        console.log(`  TLS: ${(response.socket as any)?.getProtocol?.() ?? 'unknown'}`);
        res({ ok: true, statusCode: response.statusCode });
      },
    );

    req.on('error', (err) => {
      const code = (err as any)?.code;
      const msg = err.message;
      let bucket = 'UNKNOWN';
      if (code === 'ECONNREFUSED') bucket = 'CONNECTION_REFUSED';
      else if (code === 'ENOTFOUND') bucket = 'DNS_ERROR';
      else if (code === 'ECONNRESET') bucket = 'CONNECTION_RESET';
      else if (code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' || msg.includes('certificate')) bucket = 'TLS_ERROR';
      else if (code === 'ETIMEDOUT' || code === 'ESOCKETTIMEDOUT') bucket = 'TIMEOUT';

      console.log(`  ✗ ${bucket}: ${code ?? ''} ${msg}`);
      res({ ok: false, error: bucket });
    });

    req.on('timeout', () => {
      console.log(`  ✗ TIMEOUT: connection timed out after 10s`);
      req.destroy();
      res({ ok: false, error: 'TIMEOUT' });
    });

    req.end();
  });
}

// ─── 4. Authenticated API Call (minimal) ────────────────────────

async function checkApiCall(baseUrl: string, model: string, apiKey: string) {
  console.log('\n4. AUTHENTICATED API CALL (minimal)');
  console.log('─'.repeat(50));

  // Use a tiny text-only request to test auth + endpoint routing
  const url = `${baseUrl}/models/${model}:generateContent`;
  console.log(`  URL: ${url.replace(apiKey, '***')}`);

  const body = {
    contents: [{ parts: [{ text: 'Say hello in one word.' }] }],
    generationConfig: { maxOutputTokens: 10 },
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const start = Date.now();
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const dur = Date.now() - start;

    const text = await response.text();

    if (response.ok) {
      const data = JSON.parse(text);
      const content = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '(no text)';
      console.log(`  ✓ HTTP ${response.status} in ${dur}ms`);
      console.log(`  Response: "${content.slice(0, 50)}"`);
      return { ok: true, status: response.status };
    } else {
      let bucket = 'HTTP_ERROR';
      if (response.status === 401 || response.status === 403) bucket = 'AUTH_ERROR';
      else if (response.status === 404) bucket = 'ENDPOINT_NOT_FOUND';
      else if (response.status >= 500) bucket = 'PROVIDER_HTTP_ERROR';
      else if (response.status === 429) bucket = 'RATE_LIMITED';

      console.log(`  ✗ ${bucket}: HTTP ${response.status} in ${dur}ms`);
      console.log(`  Body: ${text.slice(0, 300)}`);
      return { ok: false, status: response.status, error: bucket };
    }
  } catch (err) {
    clearTimeout(timeout);
    const msg = err instanceof Error ? err.message : String(err);
    const name = err instanceof Error ? err.name : '';

    let bucket = 'UNKNOWN';
    if (name === 'AbortError') bucket = 'TIMEOUT';
    else if (msg.includes('fetch failed')) bucket = 'FETCH_FAILED';
    else if (msg.includes('ECONNREFUSED')) bucket = 'CONNECTION_REFUSED';
    else if (msg.includes('ECONNRESET')) bucket = 'CONNECTION_RESET';
    else if (msg.includes('certificate')) bucket = 'TLS_ERROR';

    console.log(`  ✗ ${bucket}: ${name} ${msg.slice(0, 200)}`);
    return { ok: false, error: bucket };
  }
}

// ─── 5. Image generation endpoint test ──────────────────────────

async function checkImageEndpoint(baseUrl: string, model: string, apiKey: string) {
  console.log('\n5. IMAGE GENERATION ENDPOINT');
  console.log('─'.repeat(50));

  const url = `${baseUrl}/models/${model}:generateContent`;
  console.log(`  URL: ${url.replace(apiKey, '***')}`);
  console.log(`  Model: ${model}`);

  const body = {
    contents: [{ parts: [{ text: 'A red circle on white background.' }] }],
    generationConfig: {
      responseModalities: ['IMAGE'],
      imageConfig: { aspectRatio: '1:1', imageSize: '2K' },
    },
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const start = Date.now();
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const dur = Date.now() - start;

    if (response.ok) {
      const data = await response.json();
      const parts = data?.candidates?.[0]?.content?.parts ?? [];
      const hasImage = parts.some((p: any) => p.inlineData || p.inline_data);
      console.log(`  ✓ HTTP ${response.status} in ${dur}ms`);
      console.log(`  Has image: ${hasImage}`);
      console.log(`  Parts: ${parts.map((p: any) => p.inlineData || p.inline_data ? 'image' : 'text').join(', ')}`);
      return { ok: true, hasImage };
    } else {
      const text = await response.text();
      console.log(`  ✗ HTTP ${response.status} in ${dur}ms`);
      console.log(`  Body: ${text.slice(0, 300)}`);
      return { ok: false, status: response.status };
    }
  } catch (err) {
    clearTimeout(timeout);
    const msg = err instanceof Error ? err.message : String(err);
    const name = err instanceof Error ? err.name : '';
    let bucket = name === 'AbortError' ? 'TIMEOUT' : msg.includes('fetch failed') ? 'FETCH_FAILED' : 'UNKNOWN';
    console.log(`  ✗ ${bucket}: ${msg.slice(0, 200)}`);
    return { ok: false, error: bucket };
  }
}

// ─── Main ───────────────────────────────────────────────────────

async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║  GEMINI CONNECTIVITY DIAGNOSIS                          ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  const env = checkEnv();

  if (!env.key) {
    console.log('\n❌ DIAGNOSIS: CONFIGURATION_ISSUE — GEMINI_API_KEY not set');
    return;
  }

  const hostname = new URL(env.effectiveBase).hostname;

  const dns = await checkDns(hostname);
  const tls = await checkHttps(hostname);
  const api = await checkApiCall(env.effectiveBase, env.effectiveModel, env.key);
  const img = await checkImageEndpoint(env.effectiveBase, env.effectiveModel, env.key);

  // ── Final Diagnosis ─────────────────────────────────────────────
  console.log(`\n${'═'.repeat(60)}`);
  console.log('DIAGNOSIS');
  console.log(`${'═'.repeat(60)}`);
  console.log(`  DNS:       ${dns.ok ? '✓' : '✗ ' + dns.error}`);
  console.log(`  TLS/HTTPS: ${tls.ok ? '✓' : '✗ ' + tls.error}`);
  console.log(`  Auth API:  ${api.ok ? '✓' : '✗ ' + (api.error ?? `HTTP ${api.status}`)}`);
  console.log(`  Image API: ${img.ok ? '✓' : '✗ ' + ((img as any).error ?? `HTTP ${(img as any).status}`)}`);

  if (!dns.ok) {
    console.log(`\n  RESULT: LOCAL_NETWORK_ISSUE (DNS resolution failed)`);
  } else if (!tls.ok) {
    console.log(`\n  RESULT: LOCAL_NETWORK_ISSUE (${tls.error})`);
  } else if (!api.ok && (api.error === 'AUTH_ERROR')) {
    console.log(`\n  RESULT: CONFIGURATION_ISSUE (invalid API key)`);
  } else if (!api.ok && (api.error === 'FETCH_FAILED' || api.error === 'CONNECTION_REFUSED')) {
    console.log(`\n  RESULT: LOCAL_NETWORK_ISSUE (${api.error})`);
  } else if (!api.ok && api.error === 'TIMEOUT') {
    console.log(`\n  RESULT: PROVIDER_UNREACHABLE (API call timed out)`);
  } else if (api.ok && !img.ok) {
    console.log(`\n  RESULT: PROVIDER_HTTP_ERROR (text API works, image API fails — model-specific issue)`);
  } else if (api.ok && img.ok) {
    console.log(`\n  RESULT: PROVIDER_STABLE (all checks pass)`);
  } else {
    console.log(`\n  RESULT: INCONCLUSIVE`);
  }
  console.log();
}

main().catch(console.error);
