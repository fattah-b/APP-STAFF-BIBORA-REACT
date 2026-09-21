# iOS (.ipa) Build & App Store Upload Guide

This project is now configured with **Capacitor iOS** and a **GitHub Actions Workflow** that automatically builds your React app into an **iOS `.ipa` file** on a macOS runner and uploads it directly to App Store Connect / TestFlight.

---

## 🛠️ 1. Project Changes Made

- **Added `@capacitor/ios`** dependency to `package.json`.
- **Generated Native iOS Platform**: Directory [`ios/`](file:///c:/APP-STAFF-BIBORA-REACT/ios) has been created with `App.xcworkspace`.
- **Export Options Config**: Created [`ios/ExportOptions.plist`](file:///c:/APP-STAFF-BIBORA-REACT/ios/ExportOptions.plist).
- **GitHub Workflow**: Added [`.github/workflows/build-ios.yml`](file:///c:/APP-STAFF-BIBORA-REACT/.github/workflows/build-ios.yml).
- **Package Script**: Added `"build:ios": "vite build && npx cap sync ios"`.

---

## 🔐 2. Required GitHub Repository Secrets

Go to your GitHub Repository -> **Settings** -> **Secrets and variables** -> **Actions** -> **New repository secret**:

| Secret Name | Description | How to Obtain |
|-------------|-------------|---------------|
| `APPLE_CERTIFICATE_BASE64` | Apple Distribution Certificate (`.p12`) converted to Base64 | Export Distribution Cert from Keychain / Apple Dev Portal as `.p12`, then run `base64 -w 0 cert.p12 > p12_base64.txt` (or PowerShell `[Convert]::ToBase64String([IO.File]::ReadAllBytes("cert.p12"))`) |
| `P12_PASSWORD` | Password created when exporting the `.p12` file | The password set during `.p12` export |
| `PROVISIONING_PROFILE_BASE64` | App Store Provisioning Profile (`.mobileprovision`) converted to Base64 | Download App Store profile for `com.staff.app` from Apple Developer Portal, then convert to Base64 |
| `APPSTORE_KEY_ID` | App Store Connect API Key ID (e.g. `SJ55V9M9AU`) | App Store Connect -> Users and Access -> Integrations -> App Store Connect API |
| `APPSTORE_ISSUER_ID` | App Store Connect Issuer ID GUID | App Store Connect -> Users and Access -> Integrations -> App Store Connect API |
| `APPSTORE_PRIVATE_KEY` | Contents of `.p8` private key file | Download `.p8` key file when creating the API Key in App Store Connect |

---

## 📝 3. Update Team ID in `ios/ExportOptions.plist`

Open [`ios/ExportOptions.plist`](file:///c:/APP-STAFF-BIBORA-REACT/ios/ExportOptions.plist) and replace `YOUR_APPLE_TEAM_ID` with your 10-character Apple Developer Team ID (found in [developer.apple.com/account](https://developer.apple.com/account)):

```xml
<key>teamID</key>
<string>YOUR_ACTUAL_TEAM_ID</string>
```

---

## 🚀 4. How to Trigger the iOS Build

1. Push your code to your GitHub Repository.
2. Go to **Actions** tab on GitHub.
3. Select **Build & Upload iOS (.ipa)**.
4. Click **Run workflow**.
5. Once completed:
   - The compiled `.ipa` file will be downloadable under **Artifacts** (`Staff-App-iOS-IPA`).
   - If App Store Connect secrets are configured, it will automatically submit to TestFlight / App Store Connect.
