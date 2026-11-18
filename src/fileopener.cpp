#include "fileopener.h"

#include <QDBusConnection>
#include <QUrl>

FileOpener::FileOpener(QObject *parent)
    : QObject(parent)
{
}

bool FileOpener::registerOnBus()
{
    return QDBusConnection::sessionBus().registerObject(QStringLiteral("/ru/mirea/JitsiClient"), this,
                                                        QDBusConnection::ExportScriptableSlots);
}

QStringList FileOpener::takePending()
{
    m_taken = true;
    const QStringList pending = m_pending;
    m_pending.clear();
    return pending;
}

void FileOpener::openFile(const QStringList &files)
{
    for (const QString &file : files) {
        // Paths or file:// URLs.
        const QString path = file.startsWith(QLatin1String("file:")) ? QUrl(file).toLocalFile() : file;
        if (path.isEmpty()) continue;
        if (m_taken) emit fileOpened(path);
        else m_pending << path;
    }
}
