// Android app module. Will not build in this artifact tree (no Android SDK)
// but is production-shape and depends on the JVM-verified :core module.
//
// To build: install Android Studio Iguana+ / Android SDK 34, point ANDROID_HOME
// at the SDK, then `./gradlew :app:assembleDebug`.

plugins {
    id("com.android.application") version "8.6.0"
    kotlin("android") version "2.0.21"
    id("org.jetbrains.kotlin.plugin.compose") version "2.0.21"
    id("com.google.devtools.ksp") version "2.0.21-1.0.27"
    id("dagger.hilt.android.plugin") version "2.52"
    kotlin("plugin.serialization") version "2.0.21"
}

android {
    namespace = "com.tickernest.app"
    compileSdk = 34
    defaultConfig {
        applicationId = "com.tickernest.app"
        minSdk = 28
        targetSdk = 34
        versionCode = 1
        versionName = "0.0.1"
    }
    buildFeatures { compose = true }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    packaging {
        resources.excludes += setOf("META-INF/AL2.0", "META-INF/LGPL2.1")
    }
}

dependencies {
    implementation(project(":core"))

    // Compose BOM
    val composeBom = platform("androidx.compose:compose-bom:2024.10.00")
    implementation(composeBom)
    implementation("androidx.activity:activity-compose:1.9.3")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("androidx.navigation:navigation-compose:2.8.3")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.6")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.8.6")

    // Hilt DI
    implementation("com.google.dagger:hilt-android:2.52")
    ksp("com.google.dagger:hilt-compiler:2.52")
    implementation("androidx.hilt:hilt-navigation-compose:1.2.0")

    // Networking
    implementation("com.squareup.retrofit2:retrofit:2.11.0")
    implementation("com.jakewharton.retrofit:retrofit2-kotlinx-serialization-converter:1.0.0")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("com.squareup.okhttp3:logging-interceptor:4.12.0")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.7.3")

    // Realtime
    implementation("io.socket:socket.io-client:2.1.1") { exclude(group = "org.json", module = "json") }

    // Room offline cache
    implementation("androidx.room:room-runtime:2.6.1")
    implementation("androidx.room:room-ktx:2.6.1")
    ksp("androidx.room:room-compiler:2.6.1")

    // WorkManager (foreground refresh)
    implementation("androidx.work:work-runtime-ktx:2.9.1")
    implementation("androidx.hilt:hilt-work:1.2.0")
    ksp("androidx.hilt:hilt-compiler:1.2.0")

    // Supabase auth (Kotlin SDK)
    implementation("io.github.jan-tennert.supabase:auth-kt:2.6.0")
    implementation("io.ktor:ktor-client-android:2.3.12")

    testImplementation(kotlin("test"))
    testImplementation("org.junit.jupiter:junit-jupiter:5.11.0")
}
