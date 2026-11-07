#include "keystoreloginstore.h"
#include "keystorekey.h"

#include <QDir>
#include <QFile>
#include <QJsonDocument>
#include <QSaveFile>
#include <QStandardPaths>
#include <QtCrypto/QtCrypto>

namespace {

const char KeyMessage[] = "ru.mirea.JitsiClient/logins-file";
const QByteArray Magic("JLS1");
const int NonceSize = 12;
const int TagSize = 16;
const char CipherProvider[] = "qca-ossl";

QString loginsFile()
{
    return QStandardPaths::writableLocation(QStandardPaths::AppDataLocation) + QStringLiteral("/logins.dat");
}

QByteArray randomBytes(int size)
{
    QFile random(QStringLiteral("/dev/urandom"));
    if (!random.open(QIODevice::ReadOnly)) return QByteArray();
    const QByteArray bytes = random.read(size);
    return bytes.size() == size ? bytes : QByteArray();
}

} // namespace

KeystoreLoginStore::KeystoreLoginStore(QObject *parent)
    : QObject(parent)
{
}

void KeystoreLoginStore::open()
{
    if (m_opened) return;
    m_opened = true;
    // The key store first: it starts QCA with the thread that answers the
    // questions of its plugins; asking QCA anything before that waits forever.
    QString error;
    m_key = keystoreSecret(QByteArray(KeyMessage), &error);
    if (m_key.isEmpty()) {
        emit message(QStringLiteral("key store is not available, logins are kept until the application closes: ") + error);
        return;
    }
    if (!QCA::isSupported(qPrintable(QCA::Cipher::withAlgorithms(QStringLiteral("aes256"), QCA::Cipher::GCM, QCA::Cipher::NoPadding)),
                          QString::fromLatin1(CipherProvider))) {
        m_key.clear();
        emit message(QStringLiteral("AES-256-GCM is not available, logins are kept until the application closes"));
        return;
    }

    QFile file(loginsFile());
    if (!file.exists()) return;
    if (!file.open(QIODevice::ReadOnly)) {
        m_key.clear();
        emit message(QStringLiteral("the logins file cannot be read, logins are kept until the application closes"));
        return;
    }
    bool ok = false;
    m_entries = decrypt(file.readAll(), &ok);
    // A file this key does not open can never be opened again: the next
    // saved login replaces it.
    if (!ok) emit message(QStringLiteral("the logins file does not open with the key store key, it will be replaced"));
}

QJsonObject KeystoreLoginStore::decrypt(const QByteArray &data, bool *ok) const
{
    *ok = false;
    if (data.size() < Magic.size() + NonceSize + TagSize || !data.startsWith(Magic)) return QJsonObject();
    const QByteArray nonce = data.mid(Magic.size(), NonceSize);
    const QByteArray tag = data.mid(Magic.size() + NonceSize, TagSize);
    const QByteArray body = data.mid(Magic.size() + NonceSize + TagSize);
    QCA::Cipher cipher(QStringLiteral("aes256"), QCA::Cipher::GCM, QCA::Cipher::NoPadding, QCA::Decode,
                       QCA::SymmetricKey(m_key), QCA::InitializationVector(nonce), QCA::AuthTag(tag),
                       QString::fromLatin1(CipherProvider));
    QCA::SecureArray plain = cipher.update(QCA::MemoryRegion(body));
    if (!cipher.ok()) return QJsonObject();
    plain += cipher.final();
    if (!cipher.ok()) return QJsonObject();
    QJsonParseError parse;
    const QJsonDocument document = QJsonDocument::fromJson(plain.toByteArray(), &parse);
    if (parse.error != QJsonParseError::NoError || !document.isObject()) return QJsonObject();
    *ok = true;
    return document.object();
}

QByteArray KeystoreLoginStore::encrypt(const QJsonObject &entries) const
{
    const QByteArray nonce = randomBytes(NonceSize);
    if (nonce.isEmpty()) return QByteArray();
    QCA::Cipher cipher(QStringLiteral("aes256"), QCA::Cipher::GCM, QCA::Cipher::NoPadding, QCA::Encode,
                       QCA::SymmetricKey(m_key), QCA::InitializationVector(nonce), QCA::AuthTag(TagSize),
                       QString::fromLatin1(CipherProvider));
    QCA::SecureArray body = cipher.update(QCA::MemoryRegion(QJsonDocument(entries).toJson(QJsonDocument::Compact)));
    if (!cipher.ok()) return QByteArray();
    body += cipher.final();
    const QByteArray tag = cipher.tag().toByteArray();
    if (!cipher.ok() || tag.size() != TagSize) return QByteArray();
    return Magic + nonce + tag + body.toByteArray();
}

void KeystoreLoginStore::save()
{
    if (m_key.isEmpty()) return;
    const QByteArray data = encrypt(m_entries);
    if (data.isEmpty()) {
        emit message(QStringLiteral("the logins were not encrypted"));
        return;
    }
    QDir().mkpath(QStandardPaths::writableLocation(QStandardPaths::AppDataLocation));
    // QSaveFile: a failure while writing does not damage the previous file.
    QSaveFile file(loginsFile());
    if (!file.open(QIODevice::WriteOnly)) {
        emit message(QStringLiteral("the logins were not saved"));
        return;
    }
    file.setPermissions(QFileDevice::ReadOwner | QFileDevice::WriteOwner);
    file.write(data);
    if (!file.commit()) emit message(QStringLiteral("the logins were not saved"));
}

QVariantMap KeystoreLoginStore::load(const QString &host)
{
    if (host.isEmpty()) return QVariantMap();
    open();
    return m_entries.value(host.toLower()).toObject().toVariantMap();
}

void KeystoreLoginStore::update(const QString &host, const QVariantMap &fields)
{
    if (host.isEmpty()) return;
    open();
    QJsonObject entry = m_entries.value(host.toLower()).toObject();
    for (auto it = fields.begin(); it != fields.end(); ++it) {
        const QString value = it.value().toString();
        if (value.isEmpty()) entry.remove(it.key());
        else entry.insert(it.key(), value);
    }
    if (entry.isEmpty()) m_entries.remove(host.toLower());
    else m_entries.insert(host.toLower(), entry);
    save();
}
