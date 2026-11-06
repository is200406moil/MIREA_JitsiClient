#include "containerloginstore.h"
#include "keystorekey.h"

#include <QDBusConnection>
#include <QDBusConnectionInterface>
#include <QDBusInterface>
#include <QDBusMessage>
#include <QDir>
#include <QFile>
#include <QJsonDocument>
#include <QJsonObject>
#include <QSaveFile>
#include <QStandardPaths>

namespace {

const QString SStoreService = QStringLiteral("ru.omprussia.sstore");
const QString SStorePath = QStringLiteral("/ru/omprussia/sstore");
const int SStoreSuccess = 0;
const QString EntriesFile = QStringLiteral("logins.json");
// Says that the container password comes from the key store.
const QString StoreMarkFile = QStringLiteral("/container.keystore");

bool replyIs(const QDBusMessage &reply, int count)
{
    return reply.type() == QDBusMessage::ReplyMessage && reply.arguments().count() == count;
}

} // namespace

ContainerLoginStore::ContainerLoginStore(QObject *parent)
    : QObject(parent)
    , m_sstore(new QDBusInterface(SStoreService, SStorePath, SStoreService, QDBusConnection::systemBus(), this))
{
    // Creating the container encrypts a new directory and may take a while.
    m_sstore->setTimeout(60000);
}

ContainerLoginStore::~ContainerLoginStore()
{
    if (!m_path.isEmpty()) m_sstore->call(QStringLiteral("Close"));
}

QString ContainerLoginStore::fileKey(bool create)
{
    const QString dir = QStandardPaths::writableLocation(QStandardPaths::AppDataLocation);
    QFile file(dir + QStringLiteral("/storage.key"));
    if (file.open(QIODevice::ReadOnly)) {
        const QString key = QString::fromLatin1(file.readAll()).trimmed();
        if (!key.isEmpty() || !create) return key;
        file.close();
    }
    if (!create) return QString();

    // 32 random bytes from the kernel as 64 hex digits.
    QFile random(QStringLiteral("/dev/urandom"));
    if (!random.open(QIODevice::ReadOnly)) return QString();
    const QString key = QString::fromLatin1(random.read(32).toHex());
    if (key.size() != 64) return QString();
    QDir().mkpath(dir);
    QSaveFile out(file.fileName());
    if (!out.open(QIODevice::WriteOnly)) return QString();
    out.setPermissions(QFileDevice::ReadOwner | QFileDevice::WriteOwner);
    out.write(key.toLatin1());
    return out.commit() ? key : QString();
}

void ContainerLoginStore::markKeyInStore()
{
    QFile mark(QStandardPaths::writableLocation(QStandardPaths::AppDataLocation) + StoreMarkFile);
    if (!mark.exists() && mark.open(QIODevice::WriteOnly)) mark.close();
}

// The password to open or create the container with. The key store comes
// first; a container of an earlier version moves to it from storage.key.
QString ContainerLoginStore::chooseKey(bool exists)
{
    QString error;
    const QString stored = keystoreContainerPassword(&error);
    const QString legacy = fileKey(false);
    if (stored.isEmpty()) {
        if (exists && legacy.isEmpty() && QFile::exists(QStandardPaths::writableLocation(QStandardPaths::AppDataLocation) + StoreMarkFile)) {
            m_storeFailed = true;
            emit message(QStringLiteral("key store did not answer, the logins container stays closed: ") + error);
            return QString();
        }
        emit message(QStringLiteral("key store is not available, using the key file: ") + error);
        return fileKey(!exists);
    }
    markKeyInStore();
    if (!exists) {
        if (!legacy.isEmpty()) QFile::remove(QStandardPaths::writableLocation(QStandardPaths::AppDataLocation) + QStringLiteral("/storage.key"));
        return stored;
    }
    if (legacy.isEmpty()) return stored;
    const QDBusMessage reply = m_sstore->call(QStringLiteral("Recrypt"), legacy, stored);
    if (replyIs(reply, 1) && reply.arguments().at(0).toInt() == SStoreSuccess) {
        QFile::remove(QStandardPaths::writableLocation(QStandardPaths::AppDataLocation) + QStringLiteral("/storage.key"));
        emit message(QStringLiteral("logins container moved to the key store"));
        return stored;
    }
    QFile::remove(QStandardPaths::writableLocation(QStandardPaths::AppDataLocation) + StoreMarkFile);
    emit message(QStringLiteral("logins container was not moved to the key store: ") + reply.errorMessage());
    return legacy;
}

bool ContainerLoginStore::open()
{
    if (!m_path.isEmpty()) return true;
    if (m_storeFailed) return false;
    if (!m_sstore->connection().interface()->isServiceRegistered(SStoreService).value()) {
        emit message(QStringLiteral("secure storage service is not available"));
        return false;
    }

    QDBusMessage reply = m_sstore->call(QStringLiteral("Exists"));
    if (!replyIs(reply, 1)) {
        emit message(QStringLiteral("secure storage: ") + reply.errorMessage());
        return false;
    }
    bool exists = reply.arguments().at(0).toBool();
    const QString key = chooseKey(exists);
    if (m_storeFailed) return false;
    if (exists && key.isEmpty()) {
        // No key opens it (the application data was cleared): the old
        // container cannot be opened any more, a new one replaces it.
        m_sstore->call(QStringLiteral("Delete"));
        exists = false;
    }
    const QString useKey = key.isEmpty() ? chooseKey(false) : key;
    if (useKey.isEmpty()) {
        emit message(QStringLiteral("secure storage: no container key"));
        return false;
    }
    if (!exists) {
        reply = m_sstore->call(QStringLiteral("Create"), useKey);
        if (!replyIs(reply, 1) || reply.arguments().at(0).toInt() != SStoreSuccess) {
            emit message(QStringLiteral("secure storage: the container was not created ")
                         + reply.errorMessage() + QString::number(replyIs(reply, 1) ? reply.arguments().at(0).toInt() : -1));
            return false;
        }
    }
    reply = m_sstore->call(QStringLiteral("Open"), useKey);
    if (!replyIs(reply, 2) || reply.arguments().at(0).toInt() != SStoreSuccess) {
        emit message(QStringLiteral("secure storage: the container was not opened ") + reply.errorMessage());
        return false;
    }
    m_path = reply.arguments().at(1).toString();
    return !m_path.isEmpty();
}

QJsonObject ContainerLoginStore::readEntries() const
{
    QFile file(m_path + QLatin1Char('/') + EntriesFile);
    if (!file.open(QIODevice::ReadOnly)) return QJsonObject();
    return QJsonDocument::fromJson(file.readAll()).object();
}

void ContainerLoginStore::writeEntries(const QJsonObject &entries)
{
    QSaveFile file(m_path + QLatin1Char('/') + EntriesFile);
    if (!file.open(QIODevice::WriteOnly)) {
        emit message(QStringLiteral("secure storage: the logins were not saved"));
        return;
    }
    file.write(QJsonDocument(entries).toJson(QJsonDocument::Compact));
    if (!file.commit()) emit message(QStringLiteral("secure storage: the logins were not saved"));
}

QVariantMap ContainerLoginStore::load(const QString &host)
{
    if (host.isEmpty() || !open()) return QVariantMap();
    return readEntries().value(host.toLower()).toObject().toVariantMap();
}

void ContainerLoginStore::update(const QString &host, const QVariantMap &fields)
{
    if (host.isEmpty() || !open()) return;
    QJsonObject entries = readEntries();
    QJsonObject entry = entries.value(host.toLower()).toObject();
    for (auto it = fields.begin(); it != fields.end(); ++it) {
        const QString value = it.value().toString();
        if (value.isEmpty()) entry.remove(it.key());
        else entry.insert(it.key(), value);
    }
    if (entry.isEmpty()) entries.remove(host.toLower());
    else entries.insert(host.toLower(), entry);
    writeEntries(entries);
}
