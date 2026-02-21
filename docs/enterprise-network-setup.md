# Enterprise Network Setup

This guide configures `cia` for enterprise proxies and custom CA bundles.

## Supported environment variables

| Variable | Purpose | Example |
| --- | --- | --- |
| `HTTP_PROXY` | HTTP proxy URL | `http://proxy.internal:8080` |
| `HTTPS_PROXY` | HTTPS proxy URL | `https://secure-proxy.internal:8443` |
| `NO_PROXY` | Comma-separated bypass hosts | `localhost,127.0.0.1,.internal` |
| `NODE_EXTRA_CA_CERTS` | Path to corporate CA bundle file | `/etc/ssl/certs/corporate.pem` |
| `NODE_USE_ENV_PROXY` | Enable proxy env usage (`1` or `true`) | `1` |

## Example configuration

```bash
export HTTP_PROXY="http://proxy.internal:8080"
export HTTPS_PROXY="https://secure-proxy.internal:8443"
export NO_PROXY="localhost,127.0.0.1,.internal"
export NODE_EXTRA_CA_CERTS="/etc/ssl/certs/corporate.pem"
export NODE_USE_ENV_PROXY="1"

cia run "health-check"
```

## Validation

```bash
RUN_INTEGRATION_TESTS=1 bun test packages/cli/tests/integration/enterprise-network.test.ts
```

## Troubleshooting

- **Malformed proxy URL**: include scheme (`http://` or `https://`) or configuration validation fails.
- **Invalid CA bundle path**: provide a single file path; multi-line values fail validation.
- **Proxy bypass not working**: confirm `NO_PROXY` is comma-separated with no extra quoting.
- **Config check**: run `cia --help` and `make validate-l1` to verify CLI + schema health.
