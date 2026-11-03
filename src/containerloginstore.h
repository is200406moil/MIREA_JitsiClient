#ifndef CONTAINERLOGINSTORE_H
#define CONTAINERLOGINSTORE_H

#include <QObject>
#include <QJsonObject>
#include <QVariantMap>
#include "appstate.h"

class QDBusInterface;

// Logins and organizer tokens of Jitsi servers in the application's crypto
// container (SecureStorage permission, system service ru.omprussia.sstore,
// as in the Aurora OS Secret Keeper example). The container is an encrypted
// directory; the entries are kept in a JSON file inside it.
//
// The container password is generated on first use and kept in the
// application's private data directory, which the sandbox closes to other
// applications, so the user never types it (the meeting must open without
// asking for anything again).
//
// KNOWN LIMITATION, not production grade yet (2026-11-02): the key lies next
// to the data, so root or full file system access can open the container;
// sstore also passes the container password on the securefs command line,
// where it shows in the system journal. Waiting for Open Mobile Platform's
// answer on a system key store for regular applications. The fallback is a
// storage password set by the user and asked once per device boot; only
// containerKey() changes for either.
class ContainerLoginStore : public QObject, public LoginStore
{
    Q_OBJECT
public:
    explicit ContainerLoginStore(QObject *parent = nullptr);
    ~ContainerLoginStore() override;

    QVariantMap load(const QString &host) override;
    void update(const QString &host, const QVariantMap &fields) override;

signals:
    void message(const QString &text);

private:
    bool open();
    QString containerKey(bool create);
    QJsonObject readEntries() const;
    void writeEntries(const QJsonObject &entries);

    QDBusInterface *m_sstore;
    QString m_path;
};

#endif // CONTAINERLOGINSTORE_H
