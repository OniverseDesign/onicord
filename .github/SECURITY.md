# Security Policy

## Supported Versions

We take the security of Onicord and its decentralized communication infrastructure seriously. Only the latest release line receives official security updates and patches.

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |
| < 0.1.0 | :x:                |

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues, discussions, or community chat channels.**

If you discover a security vulnerability in Onicord (such as vulnerabilities in E2EE messaging, WebRTC handling, IPC deserialization, or DHT swarm communication):

1. **GitHub Private Vulnerability Reporting (Preferred)**:
   - Go to the **Security** tab of the [Onicord repository](https://github.com/OniverseDesign/onicord).
   - Click **Report a vulnerability** to open an encrypted advisory draft.
2. **Direct Contact**:
   - Alternatively, email the maintainers at `oniverse.dsg@gmail.com` with the subject `[SECURITY] Vulnerability Report - Onicord`.

### What to Include in Your Report
- A detailed description of the vulnerability and its potential impact.
- Step-by-step reproduction instructions or a minimal proof of concept (PoC).
- Operating system version and Onicord release version.
- Any suggested mitigations or patches, if available.

### Disclosure Process
- Maintainers will acknowledge receipt within 48 hours.
- A patch will be prepared, verified, and released.
- A public security advisory will be published upon the release of the fix, crediting the reporter if desired.
