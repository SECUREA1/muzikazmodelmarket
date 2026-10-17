# Reporting security issues

Report suspected vulnerabilities privately to **jodelchad@chaines.io**. Include the affected URL, reproduction steps and impact. Do not include passwords, session tokens, wallet recovery phrases, private keys or other users' data. Do not use public GitHub issues to disclose an unpatched vulnerability.

The public reporting policy is available at `security.html` and `/.well-known/security.txt`. These reporting channels do not promise a response deadline or bounty. Keep the security.txt expiry current.

## Deployment and Google review

Google Safe Browsing, Chrome download reputation, Google Search indexing and an installable PWA are separate systems. Security headers and a manifest do not certify the site or remove a Google warning.

1. Deploy the reviewed commit to the actual public web host **and** the Render API. Check `muzikaz.com`, `www.muzikaz.com` and the Render hostname. A change on the `work` branch is not evidence that production deployed it.
2. Confirm valid TLS and HTTP-to-HTTPS redirection at the hosting edge. Render production configuration sets `NODE_ENV=production`, enabling Secure cookies and a 180-day HSTS policy without subdomain/preload commitments. Do not send credentials to an HTTP endpoint.
3. Verify the domain in [Google Search Console](https://search.google.com/search-console). Review **Security issues** and **Manual actions**, including every affected URL. Audit untrusted downloads, uploaded content, redirects and external providers; remove actual harmful content before requesting a review.
4. If Security issues reports a problem, follow [Google's remediation and review instructions](https://support.google.com/webmasters/answer/9044101?hl=en). If no issue is reported, do not invent a warning or claim Google certification. Check the [Safe Browsing status tool](https://transparencyreport.google.com/safe-browsing/search) as an additional public signal.
5. Submit `https://muzikaz.com/sitemap.xml` and inspect representative public pages. Robots directives guide crawlers; they do not secure private data. API responses use `noindex`, and private resources still require authorization.
6. Keep Node, hosting infrastructure and dependencies patched; monitor access/security reports and review user uploads. `npm audit --omit=dev` covers the declared npm graph, not CDN scripts, vendored browser code, uploaded models or a full penetration test.

## Current controls and remaining work

- API responses remain `no-store`; private uploads now use `private, no-store`. The service worker bypasses API requests, uploads and Authorization-bearing requests, respects private/no-store responses, and discards its earlier cache version on activation. Users must receive and activate the updated worker before its old cache is removed.
- Response headers limit MIME sniffing, cross-origin referrer details, embedding and form/base destinations. The CSP intentionally does **not** add a strict `script-src`: the existing inline scripts, CDN modules, WebGL, wallet integrations and live media need a separate nonce/hash migration. This is not a complete XSS defense.
- Administrator access retains the existing persistent-token contract. Rotate the administrator password/session secret after suspected exposure; full per-session expiry/revocation requires a separate migration.
- Administrator password failures are throttled separately from member login. The limiter is in memory and uses the connection address; multiple processes need a shared limiter, and reverse-proxy client attribution must be configured and verified before trusting forwarded headers.
- The build generates `dist/_headers` for Netlify/Cloudflare Pages with the same header policy. Hosts that do not support that file (including GitHub Pages) require equivalent edge/proxy configuration when serving separately from `server.mjs`. This repository cannot verify DNS ownership, revoke old credentials, inspect Search Console or change a hosting account without access.

No guarantee of complete security, malware-free third-party content, search ranking or Google approval is made. See [Google's prevention guidance](https://developers.google.com/search/docs/monitor-debug/security/prevent-malware) for ongoing monitoring recommendations.
