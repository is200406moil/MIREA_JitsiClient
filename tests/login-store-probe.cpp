// Checks KeystoreLoginStore on a device or emulator, with test values only.
//   login-store-probe write   saves a test login for probe.example
//   login-store-probe read    reads it back in a new process
// Uses its own data directory (ru.mirea/JitsiClientProbe), not the
// application's. Exit code 0 means the step worked.
#include "../src/keystoreloginstore.h"

#include <QCoreApplication>
#include <QFile>
#include <QStandardPaths>
#include <cstdio>

int main(int argc, char **argv)
{
    QCoreApplication application(argc, argv);
    application.setOrganizationName(QStringLiteral("ru.mirea"));
    application.setApplicationName(QStringLiteral("JitsiClientProbe"));
    const QString step = argc > 1 ? QString::fromLatin1(argv[1]) : QString();
    const QString file = QStandardPaths::writableLocation(QStandardPaths::AppDataLocation) + QStringLiteral("/logins.dat");

    KeystoreLoginStore store;
    QObject::connect(&store, &KeystoreLoginStore::message,
                     [](const QString &text) { std::printf("store: %s\n", qPrintable(text)); });

    if (step == QLatin1String("write")) {
        store.update(QStringLiteral("probe.example"), {{"username", "probe-user"}, {"password", "probe-pass"}});
        QFile data(file);
        if (!data.open(QIODevice::ReadOnly)) {
            std::printf("FAIL no file\n");
            return 1;
        }
        const QByteArray bytes = data.readAll();
        std::printf("file size: %d\n", bytes.size());
        std::printf("plain text in file: %s\n", bytes.contains("probe-pass") || bytes.contains("probe-user") ? "YES" : "no");
        return bytes.contains("probe-pass") ? 1 : 0;
    }
    if (step == QLatin1String("read")) {
        const QVariantMap entry = store.load(QStringLiteral("PROBE.example"));
        const bool same = entry.value("username").toString() == QLatin1String("probe-user")
                && entry.value("password").toString() == QLatin1String("probe-pass");
        std::printf("read back: %s\n", same ? "yes" : "NO");
        return same ? 0 : 1;
    }
    std::printf("usage: login-store-probe write|read\n");
    return 2;
}
