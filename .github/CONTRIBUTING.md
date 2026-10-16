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

Onicord provides a multi-language experience. To maintain localization parity:
- **Never hardcode user-visible strings** directly in JSX components or backend user notices.
- Always use the `t("namespace.key")` translation function from `react-i18next`.
- Whenever you add or modify a string key, you **must update both base locale files**:
  - `src/i18n/locales/es.json` (Spanish - canonical source of truth)
  - `src/i18n/locales/en.json` (English)
- Ensure translation keys are placed under logical namespaces matching the component or domain (e.g., `sidebar`, `settings`, `chat`, `voice`).

### Adding a New Language Translation

We welcome community translations to any language! To contribute a new translation:

1. **Copy the canonical source**:
   Copy `src/i18n/locales/es.json` (or `en.json`) and save it as `src/i18n/locales/<language-code>.json` using standard two-letter ISO 639-1 language codes (e.g., `pt.json`, `fr.json`, `de.json`, `it.json`, `ja.json`).

2. **Translate the string values**:
   - Translate only the values on the right side of the colon; **keep all JSON keys identical** to `es.json`.
   - **Do not translate interpolation variables** enclosed in curly braces (e.g., `{{count}}`, `{{username}}`, `{{days}}`).
   - Preserve HTML tags and markdown markers if present in the text.

3. **Register the language in the app**:
   Open `src/i18n/languages.js`, import your new JSON file, and add your language to the `SUPPORTED_LANGUAGES` array:
   ```javascript
   import pt from "./locales/pt.json";

   export const SUPPORTED_LANGUAGES = [
     // ... existing languages
     {
       code: "pt",
       name: "Portuguese",
       nativeName: "Português",
       translation: pt,
     },
   ];
   ```
   The application will automatically register the translation bundle and display the new language in the Settings selector without any extra UI changes.

4. **Verify and submit**:
   - Run `npm start` and verify your language in **Settings > General > Language**.
   - Ensure `npm run build` succeeds without syntax errors.
   - Open a Pull Request with the title: `i18n: add <Language Name> translation`.

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
