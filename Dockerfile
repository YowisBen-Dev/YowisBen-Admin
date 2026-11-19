# ============================================================
# YowisBen Dev — Dockerfile LENGKAP (Flutter builder + yt-dlp)
# Image-nya besar & build pertama agak lama, tapi SEMUA fitur
# jalan: deploy APK Flutter, download video, deploy website.
# Kalau mau ringan (tanpa builder Flutter), pakai Dockerfile.light
# ============================================================
FROM node:20-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive
ENV FLUTTER_HOME=/opt/flutter
ENV ANDROID_HOME=/opt/android-sdk
ENV PATH="${FLUTTER_HOME}/bin:${ANDROID_HOME}/cmdline-tools/latest/bin:${ANDROID_HOME}/platform-tools:${PATH}"
ENV JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64

RUN apt-get update && apt-get install -y --no-install-recommends \
    openjdk-17-jdk-headless curl unzip xz-utils git ffmpeg \
    python3 python3-pip ca-certificates file \
  && rm -rf /var/lib/apt/lists/*

# yt-dlp untuk download video semua sosmed
RUN (pip3 install --break-system-packages yt-dlp 2>/dev/null || pip3 install yt-dlp) \
  && yt-dlp --version

# Android SDK (cmdline-tools + platform + build-tools)
RUN mkdir -p ${ANDROID_HOME}/cmdline-tools \
  && curl -sSL -o /tmp/tools.zip https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip \
  && unzip -q /tmp/tools.zip -d ${ANDROID_HOME}/cmdline-tools \
  && mv ${ANDROID_HOME}/cmdline-tools/cmdline-tools ${ANDROID_HOME}/cmdline-tools/latest \
  && rm -f /tmp/tools.zip \
  && (yes | sdkmanager --licenses >/dev/null 2>&1 || true) \
  && sdkmanager --install "platform-tools" "platforms;android-34" "build-tools;34.0.0" >/dev/null

# Flutter SDK (stable 3.24.5) + precache artefak Android biar build pertama tidak lambat
RUN git clone -b 3.24.5 --depth 1 https://github.com/flutter/flutter.git ${FLUTTER_HOME} \
  && git config --global --add safe.directory ${FLUTTER_HOME} \
  && flutter config --no-analytics \
  && flutter precache --android --universal

WORKDIR /app

COPY package*.json ./
RUN (npm ci --omit=dev 2>/dev/null || npm install --omit=dev)

COPY . .
RUN mkdir -p data public/sites

EXPOSE 3000
CMD ["node", "src/index.js"]
