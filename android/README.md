# АвтоДозвон Бот (Android / Kotlin)

Нативный Android-проект на Kotlin + Jetpack Compose для сборки APK в GitHub Actions или Android Studio.

## Сборка APK через GitHub Actions (без Android Studio)

В репозитории уже добавлен готовый workflow: `.github/workflows/build-android-apk.yml`.

1. Загрузите проект в свой репозиторий на GitHub (в ветку `main` или `master`).
2. Откройте вкладку **Actions** в репозитории.
3. Выберите workflow **Build Android APK**.
4. Если сборка не стартовала автоматически, нажмите **Run workflow → Run workflow**.
5. После завершения сборки (обычно 2–4 минуты) откройте завершённый запуск и скачайте файл в разделе **Artifacts → AutoDialerBot-debug-apk**.
6. Распакуйте архив, перенесите `app-debug.apk` на Android-телефон и установите его.

## Сборка APK локально в Android Studio

1. Откройте папку `android/` в **Android Studio** (*File → Open...*).
2. Дождитесь завершения синхронизации Gradle.
3. Выберите **Build → Build Bundle(s) / APK(s) → Build APK(s)**.
4. Готовый файл будет находиться в `android/app/build/outputs/apk/debug/app-debug.apk`.

## Настройка на телефоне

- При первом запуске выдайте разрешения на **Телефон**, **Микрофон** и **Уведомления**.
- Для максимально точного отслеживания ответа абонента и сброса вызова на любых прошивках откройте вкладку **Настройки** и нажмите **«Назначить звонилкой по умолчанию»**.
