#ifndef KEYSTORELOGINSTORE_H
#define KEYSTORELOGINSTORE_H

#include <QByteArray>
#include <QJsonObject>
#include <QObject>
#include <QVariantMap>
#include <future>
#include "appstate.h"

// Logins, organizer tokens and stream keys of Jitsi servers, kept by server
// in the file logins.dat in the application's data directory. The file is
// encrypted with AES-256-GCM. Its key is computed in the system key store
// (keystorekey.h) and exists only in the application's memory, so the file
// cannot be read without the store, and the user never types a password
// (the meeting must open without asking for anything again).
//
// When the key store cannot be used (as in the SDK emulator), logins are kept
// in memory until the application closes, and the file is left untouched.
// The key is asked for in the background when the application starts: a key
// store that does not answer must not stop the interface from joining a
// meeting. Logins saved before the key arrives are kept in memory and written
// to the file once it does.
class KeystoreLoginStore : public QObject, public LoginStore
{
    Q_OBJECT
public:
    explicit KeystoreLoginStore(QObject *parent = nullptr);

    QVariantMap load(const QString &host) override;
    void update(const QString &host, const QVariantMap &fields) override;

signals:
    void message(const QString &text);

private:
    void open();
    QJsonObject decrypt(const QByteArray &data, bool *ok) const;
    QByteArray encrypt(const QJsonObject &entries) const;
    void save();

    bool m_opened = false;
    bool m_waitReported = false;
    std::future<std::pair<QByteArray, QString>> m_keyRequest;
    QByteArray m_key;
    QJsonObject m_entries;
};

#endif // KEYSTORELOGINSTORE_H
