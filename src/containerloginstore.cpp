#include "containerloginstore.h"

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

QString ContainerLoginStore::containerKey(bool create)
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

bool ContainerLoginStore::open()
{
    if (!m_path.isEmpty()) return true;
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
    QString key = containerKey(!exists);
    if (exists && key.isEmpty()) {
        // The key is gone (the application data was cleared): the old
        // container cannot be opened any more, a new one replaces it.
        m_sstore->call(QStringLiteral("Delete"));
        exists = false;
        key = containerKey(true);
    }
    if (key.isEmpty()) {
        emit message(QStringLiteral("secure storage: no container key"));
        return false;
    }
    if (!exists) {
        reply = m_sstore->call(QStringLiteral("Create"), key);
        if (!replyIs(reply, 1) || reply.arguments().at(0).toInt() != SStoreSuccess) {
            emit message(QStringLiteral("secure storage: the container was not created ")
                         + reply.errorMessage() + QString::number(replyIs(reply, 1) ? reply.arguments().at(0).toInt() : -1));
            return false;
        }
    }
    reply = m_sstore->call(QStringLiteral("Open"), key);
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
