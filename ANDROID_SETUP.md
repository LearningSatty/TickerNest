# Android Setup & Virtual Device Guide

## 1. Install Android Studio

Download **Android Studio Ladybug** (or newer) from:
https://developer.android.com/studio

Install it like any macOS app (.dmg drag to Applications).

---

## 2. First-launch SDK Setup

On first launch, Android Studio runs a Setup Wizard:

1. Choose **Standard** installation
2. It will download:
   - Android SDK (platform tools, build tools)
   - Android 14 (API 34) system image
   - Android Emulator

This takes ~5–10 minutes on a good connection.

---

## 3. Create a Virtual Device (AVD)

1. Open Android Studio → **Device Manager** (right toolbar or View → Tool Windows → Device Manager)
2. Click **+** → **Create Virtual Device**
3. Pick a phone: **Pixel 7** (recommended — good size, fast)
4. Click **Next** → select system image:
   - **API 34 (Android 14)** — pick the `x86_64` image for Intel/AMD Mac
   - **On Apple Silicon (M1/M2/M3 Mac)**: pick `arm64-v8a` image instead
5. If the image shows a **Download** link next to it, click it and wait
6. Click **Next** → **Finish**

---

## 4. Open the TickerNest Android Project

1. In Android Studio: **File → Open**
2. Navigate to: `TickerNest/android/`
3. Click **OK** — wait for Gradle sync (~2 min first time)

If it asks to upgrade AGP (Android Gradle Plugin), click **Upgrade** and let it run.

---

## 5. Configure the API URL

The app hits the NestJS API. For the emulator, `localhost` on your Mac = `10.0.2.2`.

Edit `android/app/src/main/kotlin/com/tickernest/app/di/AppModule.kt`:

```kotlin
// Change this line:
val baseUrl = "https://api.tickernest.app/"

// To (for local dev with emulator):
val baseUrl = "http://10.0.2.2:3000/"
```

> **Tip:** Use `BuildConfig` fields to switch automatically:
> In `build.gradle.kts` add:
> ```kotlin
> buildConfigField("String", "API_URL", "\"http://10.0.2.2:3000/\"")
> ```
> Then in AppModule: `val baseUrl = BuildConfig.API_URL`

---

## 6. Wire up Supabase Auth (TokenStore)

The `TokenStore` stub in `AppModule.kt` currently returns `null` (no JWT).  
To log in properly, replace the stub:

```kotlin
// In AppModule.kt, replace the provideTokenStore() stub with:
@Provides @Singleton
fun provideTokenStore(@ApplicationContext ctx: Context): TokenStore {
    // Quick approach: read from SharedPreferences where you store the JWT
    // after a successful Supabase login screen
    val prefs = ctx.getSharedPreferences("tn_prefs", Context.MODE_PRIVATE)
    return object : TokenStore {
        override fun currentJwt(): String? = prefs.getString("tn:jwt", null)
    }
}
```

A full login screen using `supabase-kt` is a future step — for now you can
**hardcode your JWT** temporarily to test:

```kotlin
override fun currentJwt(): String? = "YOUR_SUPABASE_JWT_HERE"
```

Get your JWT from the web app: open browser DevTools → Application →
Session Storage → `tn:jwt`.

---

## 7. Run on the Virtual Device

1. Start the emulator: **Device Manager → ▶ Play** button next to your AVD
2. Wait for it to boot (first time takes ~1-2 min)
3. In Android Studio toolbar: select your AVD in the device dropdown
4. Click **▶ Run** (Shift+F10) or the green play button
5. The app installs and launches on the emulator

---

## 8. Run the API locally (for the emulator to connect)

```bash
cd TickerNest
npm run dev:api   # NestJS on port 3000
```

The emulator reaches your Mac's localhost at `10.0.2.2:3000`.

---

## 9. Hot Reload

Android Studio supports **Apply Changes** (Ctrl+F10 / ⌘+F10) which pushes
code changes without full reinstall — works well with Compose UI tweaks.

For full rebuilds: **Build → Rebuild Project** or just click **▶ Run**.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| Gradle sync fails | File → Invalidate Caches → Restart |
| `INSTALL_FAILED_CPU_ABI_INCOMPATIBLE` | Wrong system image — Apple Silicon needs arm64, Intel needs x86_64 |
| Emulator very slow | Enable Hardware Acceleration: Android Studio → SDK Manager → SDK Tools → Android Emulator Hypervisor Driver |
| `cleartext traffic not permitted` | For HTTP on emulator, add `android:usesCleartextTraffic="true"` in Manifest — already set for localhost. For prod use HTTPS. |
| App crashes on launch | Check Logcat (bottom panel) filtered to `com.tickernest.app` for the stack trace |
| `TokenStore returns null` | JWT not set — hardcode it temporarily per Step 6 |
