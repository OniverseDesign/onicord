# Contributing to Onicord

Thank you for your interest in contributing to **Onicord**! We welcome community contributions that help build a more private, decentralized, and high-fidelity communication platform.

---

## Getting Started

### Prerequisites
- **Node.js**: `v20.x` or higher (LTS recommended)
- **npm**: `v10.x` or higher
- **Git**
- **C/C++ Build Tools**: Required for native modules like `uiohook-napi` (e.g., Visual Studio Build Tools on Windows, `build-essential` on Linux, Xcode Command Line Tools on macOS).

### Local Setup
1. Fork the repository and clone your fork:
   ```bash
   git clone https://github.com/<your-username>/onicord.git
   cd onicord
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the application in development mode:
   ```bash
   npm start
   ```

---

## Contribution Workflow

1. **Create a branch** for your work:
   ```bash
   git checkout -b feature/my-new-feature
   # or
   git checkout -b fix/issue-description
   ```
2. **Make your changes** following our code style and internationalization guidelines.
3. **Verify the production build**:
   ```bash
   npm run build
   ```
4. **Commit your changes** following our commit conventions (see below).
5. **Push and open a Pull Request** against the `main` branch.

---

## Internationalization (i18n) Guidelines

Onicord provides a bilingual experience (English & Spanish). To maintain localization parity:
- **Never hardcode user-visible strings** directly in JSX components or backend user notices.
- Always use the `t("namespace.key")` translation function from `react-i18next`.
- Whenever you add or modify a string key, you **must update both locale files**:
  - `src/i18n/locales/en.json` (English)
  - `src/i18n/locales/es.json` (Spanish)
- Ensure translation keys are placed under logical namespaces matching the component or domain (e.g., `sidebar`, `settings`, `chat`, `voice`).

---

## Git Commit Guidelines

To maintain a clean and professional Git history:
- **Language**: All commit messages must be written in **English**.
- **No Emojis**: Do not use emojis in commit messages or release notes.
- **Specific & Descriptive**: Never use generic messages like `"update"`, `"fixes"`, or `"clean project"`. Clearly explain what component was changed and why.
  - Good: `fix(voice): handle peer renegotiation on connection reset`
  - Good: `feat(ui): add smooth hover transitions for member list actions`
  - Bad: `various bugfixes`
- **Release Alignment**: Release commits must reference the bullet points and highlights written in `RELEASE_NOTES.md`.

---

## Pull Request Checklist

Before submitting your pull request, please verify:
- [ ] Code builds without errors (`npm run build`).
- [ ] All new UI strings are properly localized in both `en.json` and `es.json`.
- [ ] Commit history is clean and follows the conventions above.
- [ ] No temporary files, build outputs (`dist/`, `release/`), or environment files (`.env`) are included.
- [ ] The PR description clearly explains the changes and links to any related issues.
