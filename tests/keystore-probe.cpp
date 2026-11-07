// Checks the logins key on a device or emulator: runs the code of
// src/keystorekey.cpp twice and says if the key store gave the same result.
// Prints no secret. Exit code 0 means the key store works.
#include "../src/keystorekey.h"

#include <QCoreApplication>
#include <QCryptographicHash>
#include <cstdio>

int main(int argc, char **argv)
{
    QCoreApplication application(argc, argv);
    const QByteArray message("ru.mirea.JitsiClient/logins-file");
    QString error;
    const QByteArray first = keystoreSecret(message, &error);
    if (first.isEmpty()) {
        std::printf("FAIL first call: %s\n", qPrintable(error));
        return 1;
    }
    const QByteArray second = keystoreSecret(message, &error);
    if (second.isEmpty()) {
        std::printf("FAIL second call: %s\n", qPrintable(error));
        return 1;
    }
    std::printf("key length: %d bytes\n", first.size());
    std::printf("same on second call: %s\n", first == second ? "yes" : "NO");
    std::printf("fingerprint: %s\n", QCryptographicHash::hash(first, QCryptographicHash::Sha256).toHex().left(8).constData());
    return first == second && first.size() == 32 ? 0 : 1;
}
