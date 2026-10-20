# Deployment and host hardening (Blueprint §10.3, §10.4, §13)

Status: **drafted and partly verified.** The Dockerfile has NOT been built or run on this machine
(Docker Desktop's engine was not running); see "What is verified" at the end. Synthetic data only
until every §11.1 approval is in writing.

## Image

`Dockerfile` (repo root) builds the frontend, then a slim Python image (PDF is built in Python with ReportLab) and
runs `uvicorn app.web:app` as a non-root user (uid 10001); PDFs are built in Python (ReportLab), no office suite is installed. `app.web` serves the built frontend at `/`
and the API at `/api`, every response with `Cache-Control: no-store` (§10.2).

## Run it (all of these flags matter)

```
docker run --rm -p 8000:8000 \
  --read-only --tmpfs /tmp:rw,noexec,nosuid,size=256m \
  --memory 2g --memory-swap 2g \
  --ulimit core=0 \
  --cap-drop ALL --security-opt no-new-privileges \
  -e TOKEN_SECRET="$(openssl rand -hex 32)" \
  -e PROVIDER_GATE_APPROVED=false \
  -e DEV_AUTH_ENABLED=false \
  mediscribe
```

| Requirement (§10.3) | How it is met |
|---|---|
| Swap disabled | `--memory-swap` equal to `--memory` gives the container no swap. On the host: `swapoff -a`, remove swap entries from `/etc/fstab`, `vm.swappiness=0`. Verify with `free -m` (swap 0) |
| Core dumps disabled | `--ulimit core=0` in the container; on the host `ulimit -c 0`, `kernel.core_pattern=|/bin/false`, `fs.suid_dumpable=0`, and `systemd` `LimitCORE=0` |
| Body logging disabled at app, proxy, load balancer | App: no body logging exists and a log filter drops records with content fields (`app/logging_filter.py`, tested). Run uvicorn with `--no-access-log`. Proxy: nginx `access_log off;` or a log format without `$request_body`; never enable `$request_body_file`, `proxy_request_buffering` to disk (use `client_body_in_file_only off;`, `client_max_body_size 55m;`). Load balancer: disable payload logging |
| PDF renderer leaves nothing behind | PDFs are built in memory with ReportLab (`app/render/pdf_builder.py`): no temp directory, profile or external program (tested: nothing created in temp or the working directory) |
| Read-only root filesystem with tmpfs for temp files | `--read-only --tmpfs /tmp`; `HOME=/tmp` in the image. Rendering needs no temp files; the tmpfs is a safety net |
| No snapshots or backups of processing hosts | Use ephemeral compute only; no volume mounts; disable VM/disk snapshot policies and backup agents for the host group; document in the incident plan |
| Crash reporting strips request data | Do not install crash reporters that capture locals or request bodies. If one is required, configure it to drop request data and test with the privacy marker |
| TLS everywhere | Terminate TLS at the proxy; HSTS on; internal hop also TLS where the proxy is off-host |
| API keys only in server-side secret management | `TOKEN_SECRET` and any future provider keys come from the platform secret store, never the image or repo |
| Rate and upload limits per user | `RATE_LIMIT_PER_MINUTE` (default 60), `MAX_UPLOAD_BYTES` (default 50 MB, about 50 minutes at 64 kbit/s) |
| Provider gate | `PROVIDER_GATE_APPROVED=false` by default; a real adapter also needs the provider in `PROVIDER_ALLOW_LIST` (§10.5, `docs/governance/provider_gate_checklist.md`) |

## Sign-in

`DEV_AUTH_ENABLED=false` in any shared environment. The facility SSO (OIDC/SAML) integration replaces
`/auth/dev-login`; it must return the same short-lived signed token and must never link identity to
clinical content (ADR-0003). Until then nothing here is suitable for real users.

## Environment variables

`PROVIDER` (`mock`), `PROVIDER_GATE_APPROVED` (`false`), `PROVIDER_ALLOW_LIST` (JSON list, empty),
`TOKEN_SECRET`, `TOKEN_TTL_SECONDS` (900), `TOKEN_ABSOLUTE_SECONDS` (7200), `MAX_UPLOAD_BYTES`,
`RATE_LIMIT_PER_MINUTE`, `SYNTHETIC_ONLY` (`true`: exports print a DEMONSTRATION line), `STATIC_DIR`,
`FIXTURES_DIR`.

## What is verified (and what is not)

Verified by tests in this repository: no-store on every response including static files and errors;
no body or marker in logs; no marker on disk or in temp; PDF temp directory deleted even on failure;
render refused on hash mismatch; token revocation; upload and rate limits; load test (20 concurrent
30-minute recordings) memory behaviour on the development host (`docs/evaluation/load_test.md`).

NOT verified here: the Docker image build, swap/core-dump settings on a real Linux host, proxy and load-balancer logging configuration,
SSO. Each is an item for the security lead before any pilot (§11.1).
