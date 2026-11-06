#include "keystorekey.h"

#include <QDir>
#include <QObject>
#include <QThread>
#include <QtCrypto/QtCrypto>

namespace {

const char ProviderName[] = "qca-aurora-pkcs11";
const QString StoreId = QStringLiteral("USERAPP");
const QString KeyType = QStringLiteral("generic");
const int KeySize = 48;
// The PIN of the USERAPP token, as in the Aurora OS Keystore example: the
// token is already bound to this application and this user.
const char TokenPin[] = "0000";
const char Message[] = "ru.vkr.JitsiAuroraPrototype/logins-container";
const unsigned long TimeoutMs = 30000;

// The token module: TEE on devices that have it, SoftHSM on the others and
// in the emulator.
QString tokenModule()
{
    const QStringList modules = QDir(QStringLiteral("/etc/kcapi/qca_aurora_pkcs11")).entryList(QDir::Files);
    return modules.contains(QStringLiteral("cktee")) ? QStringLiteral("cktee") : QStringLiteral("Aurora-SoftHSM");
}

// Answers the questions of the plugin; it asks them from another thread
// while the key store call waits.
class KeystoreAnswers : public QObject
{
public:
    void start()
    {
        connect(&m_handler, &QCA::EventHandler::eventReady, this,
                [this](int id, const QCA::Event &event) { answer(id, event); });
        m_handler.start();
    }

private:
    void answer(int id, const QCA::Event &event)
    {
        switch (event.type()) {
        case QCA::Event::Password: m_handler.submitPassword(id, QCA::SecureArray(TokenPin)); break;
        case QCA::Event::KeyStoreId: m_handler.submitKeyStoreId(id, StoreId); break;
        case QCA::Event::KeyStoreName: m_handler.submitKeyStoreName(id, StoreId); break;
        case QCA::Event::KeyStoreEntryName: m_handler.submitKeyStoreEntryName(id, QStringLiteral("logins-container")); break;
        case QCA::Event::KeyStorePkcs11Provider: m_handler.submitKeyStorePkcs11Provider(id, tokenModule()); break;
        case QCA::Event::KeyType: m_handler.submitKeyType(id, KeyType); break;
        default: m_handler.reject(id); break;
        }
    }

    QCA::EventHandler m_handler;
};

class AnswersThread : public QThread
{
protected:
    void run() override
    {
        KeystoreAnswers answers;
        answers.start();
        exec();
    }
};

QCA::SymmetricKey storedKey(QCA::KeyStore &store)
{
    const QList<QCA::KeyStoreEntry> entries = store.entryList();
    for (const QCA::KeyStoreEntry &entry : entries) {
        if (entry.type() == QCA::KeyStoreEntry::TypeSymmetricKey && entry.symmetricKey().size() == KeySize)
            return entry.symmetricKey();
    }
    return QCA::SymmetricKey();
}

class WorkThread : public QThread
{
public:
    QString password;
    QString error;

protected:
    void run() override
    {
        // The plugin is found only after the provider list has been read.
        QStringList providers;
        const QCA::ProviderList list = QCA::providers();
        for (QCA::Provider *provider : list) providers << provider->name();
        QCA::KeyStoreManager::start(QString::fromLatin1(ProviderName));
        QCA::KeyStoreManager manager;
        manager.waitForBusyFinished();
        manager.sync();
        if (!manager.keyStores().contains(StoreId)) {
            error = QStringLiteral("the USERAPP key store is not available, found: ") + manager.keyStores().join(QLatin1Char(',')) + QStringLiteral("; providers: ") + providers.join(QLatin1Char(',')) + QStringLiteral("; ") + QCA::KeyStoreManager::diagnosticText().left(300);
            return;
        }
        {
            QCA::KeyStore probe(StoreId, &manager);
            // A token nobody has used yet has no label.
            if (probe.name() == QLatin1String("********************************")) {
                manager.initKeyStore(StoreId);
                manager.sync();
            }
        }
        QCA::KeyStore store(StoreId, &manager);
        store.switchOperatingMode(QCA::KeyStore::RWUserPKCS11);
        QCA::SymmetricKey key = storedKey(store);
        if (key.isNull() || key.size() == 0) {
            const QCA::SymmetricKey created(KeySize, QString::fromLatin1(ProviderName));
            if (created.isNull()) {
                error = QStringLiteral("the key was not generated");
                return;
            }
            manager.sync();
            key = storedKey(store);
            if (key.size() == 0) key = created;
        }
        if (!QCA::isSupported("hmac(sha256)", QString::fromLatin1(ProviderName))) {
            error = QStringLiteral("hmac(sha256) is not supported");
            return;
        }
        QCA::MessageAuthenticationCode mac(QStringLiteral("hmac(sha256)"), QCA::SecureArray(), QString::fromLatin1(ProviderName));
        mac.setup(key);
        mac.update(QCA::MemoryRegion(QByteArray(Message)));
        const QByteArray digest = mac.final().toByteArray();
        if (digest.size() != 32) {
            error = QStringLiteral("the key store gave no result");
            return;
        }
        password = QString::fromLatin1(digest.toHex());
    }
};

} // namespace

QString keystoreContainerPassword(QString *error)
{
    static QCA::Initializer initializer;
    // On the heap: a call stuck in the key store cannot be cancelled, then
    // the threads stay until the process ends.
    AnswersThread *answers = new AnswersThread;
    WorkThread *work = new WorkThread;
    answers->start();
    work->start();
    if (!work->wait(TimeoutMs)) {
        if (error) *error = QStringLiteral("the key store did not answer");
        return QString();
    }
    const QString password = work->password;
    if (error) *error = work->error;
    delete work;
    answers->quit();
    if (answers->wait(5000)) delete answers;
    return password;
}
