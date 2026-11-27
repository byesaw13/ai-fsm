plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Release signing comes from the environment so no key is ever committed.
// Use the same keystore for every release, or Android refuses the update.
val releaseStore = System.getenv("DOVETAILS_PHONE_KEYSTORE")

android {
    namespace = "services.dovetails.phone"
    compileSdk = 35

    defaultConfig {
        applicationId = "services.dovetails.phone"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0"
    }

    signingConfigs {
        if (releaseStore != null) {
            create("release") {
                storeFile = file(releaseStore)
                storePassword = System.getenv("DOVETAILS_PHONE_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("DOVETAILS_PHONE_KEY_ALIAS") ?: "dovetails-phone"
                keyPassword = System.getenv("DOVETAILS_PHONE_KEY_PASSWORD")
                    ?: System.getenv("DOVETAILS_PHONE_KEYSTORE_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            if (releaseStore != null) signingConfig = signingConfigs.getByName("release")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    buildFeatures {
        buildConfig = true
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.work:work-runtime-ktx:2.9.1")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.1")
    testImplementation("junit:junit:4.13.2")
}
